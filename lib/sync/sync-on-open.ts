'use client'

import { db } from '@/lib/db'
import {
  getSyncMeta,
  isGoogleTokenValid,
  markSyncConflictPending,
  clearSyncConflictPending,
} from '@/lib/hooks/use-sync-meta'
import {
  getSyncFileModifiedTime,
  downloadSyncFileFromGDriveWithMeta,
  applyRemoteBackupAndAcknowledge,
} from '@/lib/sync'
import {
  runDriveSyncUnlocked,
  withDriveSyncLock,
  isDirtyPending,
} from '@/lib/sync/sync-engine'

export type SyncOnOpenResult =
  | 'noop'
  | 'uploaded'
  | 'pulled'
  | 'conflict'

function isConflictSnoozed(
  meta: Awaited<ReturnType<typeof getSyncMeta>>,
  remoteModified: string
): boolean {
  if (!meta?.conflictSnoozedUntil || Date.now() > meta.conflictSnoozedUntil) return false
  return meta.conflictSnoozedRemoteModifiedTime === remoteModified
}

/** True when local has no user-created content yet. */
export async function isLocalDataEmpty(): Promise<boolean> {
  const [catCount, cardCount] = await Promise.all([
    db.categories.count(),
    db.cards.count(),
  ])
  return catCount === 0 && cardCount === 0
}

/**
 * Samsung Notes–style open sync:
 * - remote unchanged → upload if pending only
 * - remote changed, local clean → silent pull
 * - remote changed, local dirty → conflict
 */
export async function syncOnAppOpen(): Promise<SyncOnOpenResult> {
  return withDriveSyncLock(async () => {
    const meta = await getSyncMeta()
    if (!isGoogleTokenValid(meta)) return 'noop'

    const remoteModified = await getSyncFileModifiedTime()

    if (!remoteModified) {
      // No remote file → no conflict possible; safe to upload local if pending.
      await clearSyncConflictPending()
      if (meta?.hasPendingLocalChanges || isDirtyPending()) {
        const ok = await runDriveSyncUnlocked()
        return ok ? 'uploaded' : 'noop'
      }
      return 'noop'
    }

    const lastKnown = meta?.lastKnownRemoteModifiedTime ?? null
    const remoteChanged = lastKnown !== remoteModified

    if (!remoteChanged) {
      // Remote unchanged since last known → safe to upload local if pending.
      await clearSyncConflictPending()
      if (meta?.hasPendingLocalChanges || isDirtyPending()) {
        const ok = await runDriveSyncUnlocked()
        return ok ? 'uploaded' : 'noop'
      }
      return 'noop'
    }

    if (isConflictSnoozed(meta, remoteModified)) {
      return 'noop'
    }

    // After "delete all data", never silently restore from Drive — ask the user.
    if (meta?.skipAutoRestore) {
      await markSyncConflictPending()
      return 'conflict'
    }

    if (!meta?.hasPendingLocalChanges && !isDirtyPending()) {
      const localEmpty = await isLocalDataEmpty()
      const canSilentPull = lastKnown !== null || localEmpty

      if (!canSilentPull) {
        await markSyncConflictPending()
        return 'conflict'
      }

      const download = await downloadSyncFileFromGDriveWithMeta()
      if (!download) return 'noop'
      const backup = download.backup

      // Guard: never silently wipe existing local data with an empty remote backup
      // (corrupt/cleared remote file). Surface as a conflict so the user decides.
      const remoteEmpty = backup.categories.length === 0 && backup.cards.length === 0
      if (remoteEmpty && !localEmpty) {
        await markSyncConflictPending()
        return 'conflict'
      }

      // Re-check: user may have edited while download was in flight.
      const metaAgain = await getSyncMeta()
      if (isDirtyPending() || metaAgain?.hasPendingLocalChanges) {
        await markSyncConflictPending()
        return 'conflict'
      }

      await applyRemoteBackupAndAcknowledge(backup, download.modifiedTime)
      return 'pulled'
    }

    await markSyncConflictPending()
    return 'conflict'
  })
}
