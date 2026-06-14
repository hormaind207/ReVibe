'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db, type DBSyncMeta } from '../db'

const META_ID = 'meta'

const DEFAULT_SYNC_META: Omit<DBSyncMeta, 'id'> = {
  lastSyncedAt: null,
  googleEmail: null,
  googleAccessToken: null,
  googleTokenExpiry: null,
  lastKnownRemoteModifiedTime: null,
  hasPendingLocalChanges: false,
  lastRemoteExportedAt: null,
  conflictSnoozedUntil: null,
  conflictSnoozedRemoteModifiedTime: null,
  syncConflictPending: false,
  skipAutoRestore: false,
}

export function useSyncMeta() {
  return useLiveQuery(() => db.syncMeta.get(META_ID), [], undefined)
}

export async function getSyncMeta(): Promise<DBSyncMeta | undefined> {
  return db.syncMeta.get(META_ID)
}

export async function updateSyncMeta(data: Partial<Omit<DBSyncMeta, 'id'>>): Promise<void> {
  const existing = await db.syncMeta.get(META_ID)
  if (existing) {
    await db.syncMeta.update(META_ID, data)
  } else {
    await db.syncMeta.put({
      id: META_ID,
      ...DEFAULT_SYNC_META,
      ...data,
    })
  }
}

export async function markLocalChangesPending(): Promise<void> {
  await updateSyncMeta({ hasPendingLocalChanges: true })
}

export async function markLocalChangesSynced(opts?: {
  remoteModifiedTime?: string | null
  exportedAt?: number | null
  lastUploadedHash?: string | null
}): Promise<void> {
  await updateSyncMeta({
    hasPendingLocalChanges: false,
    skipAutoRestore: false,
    lastSyncedAt: Date.now(),
    ...(opts?.remoteModifiedTime !== undefined
      ? { lastKnownRemoteModifiedTime: opts.remoteModifiedTime }
      : {}),
    ...(opts?.exportedAt !== undefined ? { lastRemoteExportedAt: opts.exportedAt } : {}),
    ...(opts?.lastUploadedHash !== undefined ? { lastUploadedHash: opts.lastUploadedHash } : {}),
  })
}

export async function markSyncConflictPending(): Promise<void> {
  await updateSyncMeta({ syncConflictPending: true })
}

export async function clearSyncConflictPending(): Promise<void> {
  await updateSyncMeta({ syncConflictPending: false })
}

export async function snoozeDriveConflict(remoteModifiedTime: string): Promise<void> {
  const SNOOZE_MS = 24 * 60 * 60 * 1000
  // NOTE: lastKnownRemoteModifiedTime is intentionally NOT advanced here.
  // Advancing it would make the next open see "remote unchanged" and silently
  // upload local over remote (data loss). Keeping it lets the conflict re-surface
  // after the snooze window while automatic uploads stay blocked meanwhile.
  await updateSyncMeta({
    conflictSnoozedUntil: Date.now() + SNOOZE_MS,
    conflictSnoozedRemoteModifiedTime: remoteModifiedTime,
  })
}

/** Record remote baseline without snoozing conflict (e.g. decline restore on first connect). */
export async function acknowledgeRemoteBaseline(remoteModifiedTime: string): Promise<void> {
  await updateSyncMeta({ lastKnownRemoteModifiedTime: remoteModifiedTime })
}

export async function clearGoogleAuth(): Promise<void> {
  // Also reset the remote sync baseline so a later reconnect re-establishes it
  // cleanly instead of mis-detecting pull/upload from a stale baseline.
  await updateSyncMeta({
    googleEmail: null,
    googleAccessToken: null,
    googleTokenExpiry: null,
    lastSyncedAt: null,
    lastKnownRemoteModifiedTime: null,
    lastRemoteExportedAt: null,
    conflictSnoozedUntil: null,
    conflictSnoozedRemoteModifiedTime: null,
    syncConflictPending: false,
  })
}

/** Full sync meta reset when user deletes all local data. */
export async function resetDriveSyncMetaAfterDataClear(): Promise<void> {
  await updateSyncMeta({
    lastSyncedAt: null,
    googleEmail: null,
    googleAccessToken: null,
    googleTokenExpiry: null,
    lastKnownRemoteModifiedTime: null,
    hasPendingLocalChanges: false,
    lastRemoteExportedAt: null,
    conflictSnoozedUntil: null,
    conflictSnoozedRemoteModifiedTime: null,
    syncConflictPending: false,
    skipAutoRestore: true,
  })
}

export function isGoogleTokenValid(meta: DBSyncMeta | undefined): boolean {
  if (!meta?.googleAccessToken) return false
  if (meta.googleTokenExpiry && meta.googleTokenExpiry < Date.now()) return false
  return true
}
