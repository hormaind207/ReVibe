'use client'

/**
 * Central Google Drive sync engine: debounced upload, retry, status.
 */

import { uploadToGDrive, getSyncFileModifiedTime } from '@/lib/sync'
import { scheduleSnapshotSync } from '@/lib/push-notifications'
import {
  getSyncMeta,
  markLocalChangesPending,
  markLocalChangesSynced,
  clearSyncConflictPending,
  isGoogleTokenValid,
} from '@/lib/hooks/use-sync-meta'

export type DriveSyncStatus =
  | 'idle'
  | 'synced'
  | 'pending'
  | 'syncing'
  | 'offline'
  | 'error'
  | 'no_token'

const DEBOUNCE_MS_WIFI = 4000
const DEBOUNCE_MS_CELLULAR = 20000
const FAIL_TOAST_COOLDOWN_MS = 60_000
const TOKEN_EXPIRING_MS = 5 * 60 * 1000
const RESUME_RETRY_DEBOUNCE_MS = 500

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let pageHideFlushTimer: ReturnType<typeof setTimeout> | null = null
let resumeRetryTimer: ReturnType<typeof setTimeout> | null = null
let status: DriveSyncStatus = 'idle'
let lastFailToastAt = 0
let tokenExpiringDispatched = false
let dirtyPending = false
let syncLock: Promise<void> = Promise.resolve()
const statusListeners = new Set<(s: DriveSyncStatus) => void>()

function setStatus(next: DriveSyncStatus) {
  status = next
  statusListeners.forEach((fn) => fn(next))
}

function isSlowNetwork(): boolean {
  if (typeof navigator === 'undefined') return false
  const conn = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string; type?: string }
  }).connection
  if (!conn) return false
  if (conn.saveData) return true
  if (conn.type === 'cellular') return true
  return conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g' || conn.effectiveType === '3g'
}

function getDebounceMs(): number {
  return isSlowNetwork() ? DEBOUNCE_MS_CELLULAR : DEBOUNCE_MS_WIFI
}

/** Run pull/apply and upload operations one at a time. */
export function withDriveSyncLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = syncLock.then(fn, fn)
  syncLock = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

export function isDirtyPending(): boolean {
  return dirtyPending
}

export function getDriveSyncStatus(): DriveSyncStatus {
  return status
}

export function subscribeDriveSyncStatus(fn: (s: DriveSyncStatus) => void): () => void {
  statusListeners.add(fn)
  fn(status)
  return () => statusListeners.delete(fn)
}

async function refreshStatusFromMeta(): Promise<void> {
  const meta = await getSyncMeta()
  if (!isGoogleTokenValid(meta)) {
    setStatus(meta?.googleEmail ? 'no_token' : 'idle')
    return
  }
  if (
    typeof window !== 'undefined' &&
    meta?.googleTokenExpiry &&
    meta.googleTokenExpiry > Date.now() &&
    meta.googleTokenExpiry - Date.now() < TOKEN_EXPIRING_MS &&
    !tokenExpiringDispatched
  ) {
    tokenExpiringDispatched = true
    window.dispatchEvent(new CustomEvent('drive-token-expiring'))
  }
  if (meta?.hasPendingLocalChanges || dirtyPending) {
    setStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'pending')
    return
  }
  if (meta?.lastSyncedAt) {
    setStatus('synced')
    return
  }
  setStatus('idle')
}

function scheduleResumeRetry(): void {
  if (resumeRetryTimer) clearTimeout(resumeRetryTimer)
  resumeRetryTimer = setTimeout(() => {
    resumeRetryTimer = null
    void retryDriveSyncIfPending()
  }, RESUME_RETRY_DEBOUNCE_MS)
}

/** Mark local dirty and schedule debounced upload. */
export function scheduleDriveSync(): void {
  if (typeof window === 'undefined') return
  scheduleSnapshotSync()
  dirtyPending = true
  markLocalChangesPending().catch(() => {})
  if (!navigator.onLine) {
    setStatus('offline')
    return
  }
  setStatus('pending')
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void runDriveSync()
  }, getDebounceMs())
}

/** Immediate upload (focus loss, manual sync). */
export function flushDriveSync(): Promise<boolean> {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  return runDriveSync({ force: true })
}

/** Run upload now; returns success. Serialized via withDriveSyncLock. */
export async function runDriveSync(opts?: { force?: boolean }): Promise<boolean> {
  return withDriveSyncLock(() => runDriveSyncUnlocked(opts))
}

/** Upload body — caller must hold withDriveSyncLock (or use runDriveSync). */
export async function runDriveSyncUnlocked(opts?: { force?: boolean }): Promise<boolean> {
  const meta = await getSyncMeta()
  if (!isGoogleTokenValid(meta)) {
    await refreshStatusFromMeta()
    return false
  }
  if (meta?.syncConflictPending) {
    setStatus('pending')
    return false
  }
  if (!opts?.force && !dirtyPending && !meta?.hasPendingLocalChanges && meta?.lastSyncedAt) {
    setStatus('synced')
    return true
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setStatus('offline')
    return false
  }

  setStatus('syncing')
  try {
    await uploadToGDrive()
    const metaAfter = await getSyncMeta()
    if (dirtyPending || metaAfter?.hasPendingLocalChanges) {
      setStatus('pending')
      return true
    }
    dirtyPending = false
    setStatus('synced')
    return true
  } catch {
    setStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error')
    const now = Date.now()
    if (now - lastFailToastAt > FAIL_TOAST_COOLDOWN_MS) {
      lastFailToastAt = now
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('drive-sync-failed'))
      }
    }
    return false
  }
}

/** Retry pending upload when back online or on focus. */
export async function retryDriveSyncIfPending(): Promise<void> {
  const meta = await getSyncMeta()
  if (!dirtyPending && !meta?.hasPendingLocalChanges) {
    await refreshStatusFromMeta()
    return
  }
  await runDriveSync()
}

/** After successful manual pull — align remote timestamps without upload. */
export async function acknowledgeRemoteAfterPull(
  exportedAt?: number,
  remoteModifiedTime?: string | null
): Promise<void> {
  const remoteModified =
    remoteModifiedTime !== undefined ? remoteModifiedTime : await getSyncFileModifiedTime()
  dirtyPending = false
  await markLocalChangesSynced({
    remoteModifiedTime: remoteModified,
    exportedAt: exportedAt ?? null,
  })
  await clearSyncConflictPending()
  setStatus('synced')
}

async function maybeFlushOnPageHide(): Promise<void> {
  const meta = await getSyncMeta()
  if (!dirtyPending && !meta?.hasPendingLocalChanges) return
  const delay = isSlowNetwork() ? 2500 : 0
  if (pageHideFlushTimer) clearTimeout(pageHideFlushTimer)
  if (delay === 0) {
    void flushDriveSync()
  } else {
    pageHideFlushTimer = setTimeout(() => {
      pageHideFlushTimer = null
      void flushDriveSync()
    }, delay)
  }
}

export function initDriveSyncEngine(): () => void {
  void refreshStatusFromMeta()

  const onOnline = () => scheduleResumeRetry()
  const onFocus = () => scheduleResumeRetry()
  const onVisibility = () => {
    if (!document.hidden) scheduleResumeRetry()
  }
  const onPageHide = () => {
    void maybeFlushOnPageHide()
  }

  window.addEventListener('online', onOnline)
  window.addEventListener('focus', onFocus)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', onPageHide)

  const initialTimer = setTimeout(() => void retryDriveSyncIfPending(), 3000)

  return () => {
    clearTimeout(initialTimer)
    if (pageHideFlushTimer) clearTimeout(pageHideFlushTimer)
    if (resumeRetryTimer) clearTimeout(resumeRetryTimer)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('focus', onFocus)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', onPageHide)
    if (debounceTimer) clearTimeout(debounceTimer)
  }
}
