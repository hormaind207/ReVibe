/**
 * Google Drive Sync Module
 *
 * - Real-time sync: revibe-data.json — upload on local data change (debounced).
 * - Open sync: pull or conflict when app opens (see lib/sync/sync-on-open.ts).
 * - Manual backups: revibe-backup-YYYY-MM-DD-HHmmss.json — create/list/restore/delete separately.
 */

import { db } from './db'
import { getSyncMeta, markLocalChangesSynced, markSyncConflictPending } from './hooks/use-sync-meta'
import { updateUserProfile } from './hooks/use-user-profile'
import { syncLocalProfileFromGoogleUser } from './google-auth'
import {
  DEFAULT_NOTIFICATION_HOUR,
  DEFAULT_NOTIFICATION_MINUTE,
} from './hooks/use-notifications'
import { updateNotificationPreferences } from './push-notifications'

const DRIVE_SYNC_FILE_NAME = 'revibe-data.json'
const DRIVE_BACKUP_PREFIX = 'revibe-backup-'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'

const STORAGE_KEYS = {
  defaultMaxStages: 'defaultMaxStages',
  theme: 'theme',
  colorTheme: 'color-theme',
  notifEnabled: 'notifications',
  notifHour: 'notification_hour',
  notifMinute: 'notification_minute',
} as const

export interface DriveBackupSettings {
  defaultMaxStages: number
  theme: string
  colorTheme: string
  notifications: { enabled: boolean; hour: number; minute: number }
  userProfile: { nickname: string; avatarEmoji: string; avatarImage?: string }
}

export interface DriveBackup {
  version: number
  exportedAt: number
  categories: object[]
  stacks: object[]
  cards: object[]
  settings?: DriveBackupSettings
  streak?: { currentStreak: number; lastSuccessDate: string | null; longestStreak?: number }
}

async function getAccessToken(): Promise<string | null> {
  const meta = await getSyncMeta()
  if (!meta?.googleAccessToken) return null
  if (meta.googleTokenExpiry && meta.googleTokenExpiry < Date.now()) return null
  return meta.googleAccessToken
}

async function driveRequest(path: string, options: RequestInit, token: string) {
  const res = await fetch(path, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers ?? {}) },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Drive API error ${res.status}: ${text}`)
  }
  return res
}

async function findSyncFile(token: string): Promise<{ id: string; modifiedTime: string } | null> {
  const res = await driveRequest(
    `${DRIVE_API}/files?spaces=appDataFolder&q=name%3D%27${encodeURIComponent(DRIVE_SYNC_FILE_NAME)}%27&fields=files(id,name,modifiedTime)`,
    {},
    token
  )
  const data = await res.json()
  const file = data.files?.[0]
  return file?.id && file?.modifiedTime ? { id: file.id, modifiedTime: file.modifiedTime } : null
}

function readSettingsFromDevice(): DriveBackupSettings | null {
  if (typeof window === 'undefined') return null
  const defaultMaxStages = parseInt(
    localStorage.getItem(STORAGE_KEYS.defaultMaxStages) ?? '7',
    10
  )
  const theme = localStorage.getItem(STORAGE_KEYS.theme) ?? 'light'
  const colorTheme =
    localStorage.getItem(STORAGE_KEYS.colorTheme) ?? 'purple'
  const notifEnabled =
    localStorage.getItem(STORAGE_KEYS.notifEnabled) === 'true'
  const notifHour = Number(
    localStorage.getItem(STORAGE_KEYS.notifHour) ?? DEFAULT_NOTIFICATION_HOUR
  )
  const notifMinute = Number(
    localStorage.getItem(STORAGE_KEYS.notifMinute) ??
      DEFAULT_NOTIFICATION_MINUTE
  )
  return {
    defaultMaxStages,
    theme,
    colorTheme,
    notifications: {
      enabled: notifEnabled,
      hour: notifHour,
      minute: notifMinute,
    },
    userProfile: {
      nickname: '게스트',
      avatarEmoji: '🧠',
      avatarImage: undefined,
    },
  }
}

async function readUserProfileFromDevice(): Promise<{
  nickname: string
  avatarEmoji: string
  avatarImage?: string
}> {
  const profile = await db.userProfile.get('profile')
  return {
    nickname: profile?.nickname ?? '게스트',
    avatarEmoji: profile?.avatarEmoji ?? '🧠',
    avatarImage: profile?.avatarImage,
  }
}

async function hashBackupContent(content: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content))
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
  let h = 0
  for (let i = 0; i < content.length; i++) {
    h = (Math.imul(31, h) + content.charCodeAt(i)) | 0
  }
  return String(h >>> 0)
}

/** Push local data and settings to Google Drive (one-way). */
export async function uploadToGDrive(): Promise<void> {
  const token = await getAccessToken()
  if (!token) throw new Error('Google 계정이 연결되지 않았습니다.')

  const [categories, stacks, cards, settings, userProfile, streakRow] = await Promise.all([
    db.categories.toArray(),
    db.stacks.toArray(),
    db.cards.toArray(),
    Promise.resolve(readSettingsFromDevice()),
    readUserProfileFromDevice(),
    db.streakMeta.get('meta'),
  ])

  const backup: DriveBackup = {
    version: 2,
    exportedAt: Date.now(),
    categories,
    stacks,
    cards,
    settings: settings
      ? { ...settings, userProfile }
      : {
          defaultMaxStages: 7,
          theme: 'light',
          colorTheme: 'purple',
          notifications: {
            enabled: false,
            hour: DEFAULT_NOTIFICATION_HOUR,
            minute: DEFAULT_NOTIFICATION_MINUTE,
          },
          userProfile,
        },
    streak:
      streakRow != null
        ? { currentStreak: streakRow.currentStreak, lastSuccessDate: streakRow.lastSuccessDate, longestStreak: streakRow.longestStreak ?? streakRow.currentStreak }
        : undefined,
  }

  const content = JSON.stringify(backup)
  const contentHash = await hashBackupContent(content)
  const metaBefore = await getSyncMeta()
  if (metaBefore?.lastUploadedHash === contentHash && metaBefore?.lastSyncedAt) {
    await markLocalChangesSynced({
      exportedAt: backup.exportedAt,
      lastUploadedHash: contentHash,
    })
    return
  }

  const existing = await findSyncFile(token)
  let remoteModifiedTime: string | null = null

  if (existing) {
    const lastKnown = metaBefore?.lastKnownRemoteModifiedTime
    if (lastKnown && existing.modifiedTime !== lastKnown) {
      await markSyncConflictPending()
      throw new Error('Google Drive의 데이터가 다른 기기에서 변경되었습니다.')
    }

    const res = await driveRequest(
      `${DRIVE_UPLOAD_API}/files/${existing.id}?uploadType=media&fields=modifiedTime`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: content,
      },
      token
    )
    const patchData = (await res.json()) as { modifiedTime?: string }
    remoteModifiedTime = patchData.modifiedTime ?? existing.modifiedTime
  } else {
    const metadata = { name: DRIVE_SYNC_FILE_NAME, parents: ['appDataFolder'] }
    const form = new FormData()
    form.append(
      'metadata',
      new Blob([JSON.stringify(metadata)], { type: 'application/json' })
    )
    form.append('file', new Blob([content], { type: 'application/json' }))
    const res = await driveRequest(
      `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=modifiedTime`,
      { method: 'POST', body: form },
      token
    )
    const postData = (await res.json()) as { modifiedTime?: string }
    remoteModifiedTime = postData.modifiedTime ?? null
  }

  await markLocalChangesSynced({
    remoteModifiedTime,
    exportedAt: backup.exportedAt,
    lastUploadedHash: contentHash,
  })
}

/** Get remote modifiedTime of the real-time sync file (for pull detection). */
export async function getSyncFileModifiedTime(): Promise<string | null> {
  const token = await getAccessToken()
  if (!token) return null
  const file = await findSyncFile(token)
  return file?.modifiedTime ?? null
}

export interface DriveDownloadResult {
  backup: DriveBackup
  modifiedTime: string
}

/** Download real-time sync file and parse as DriveBackup. */
export async function downloadSyncFileFromGDrive(): Promise<DriveBackup | null> {
  const result = await downloadSyncFileFromGDriveWithMeta()
  return result?.backup ?? null
}

/** Download sync file with Drive modifiedTime (avoids extra HEAD on pull). */
export async function downloadSyncFileFromGDriveWithMeta(): Promise<DriveDownloadResult | null> {
  const token = await getAccessToken()
  if (!token) throw new Error('Google 계정이 연결되지 않았습니다.')
  const file = await findSyncFile(token)
  if (!file) {
    return null
  }
  const res = await driveRequest(
    `${DRIVE_API}/files/${file.id}?alt=media`,
    {},
    token
  )
  const backup = parseDriveBackupResponse(await res.json())
  return { backup, modifiedTime: file.modifiedTime }
}

/** Apply remote backup data to local DB and settings (no reload). */
export async function applyRemoteDataToLocal(remote: DriveBackup): Promise<void> {
  const remoteEmpty = remote.categories.length === 0 && remote.cards.length === 0
  if (remoteEmpty) {
    const [catCount, cardCount] = await Promise.all([
      db.categories.count(),
      db.cards.count(),
    ])
    if (catCount > 0 || cardCount > 0) {
      throw new Error('원격 백업이 비어 있어 로컬 데이터를 덮어쓸 수 없습니다.')
    }
  }

  // Drop orphan records (cards/stacks pointing to missing parents) so a partially
  // corrupt backup can't leave the UI with dangling references after apply.
  const categories = remote.categories as Parameters<typeof db.categories.bulkPut>[0]
  const allStacks = remote.stacks as Parameters<typeof db.stacks.bulkPut>[0]
  const allCards = remote.cards as Parameters<typeof db.cards.bulkPut>[0]
  const categoryIds = new Set(categories.map((c) => c.id))
  const stacks = allStacks.filter((s) => categoryIds.has(s.categoryId))
  const stackIds = new Set(stacks.map((s) => s.id))
  const cards = allCards.filter((c) => stackIds.has(c.stackId))

  await db.transaction('rw', [db.categories, db.stacks, db.cards], async () => {
    await db.cards.clear()
    await db.stacks.clear()
    await db.categories.clear()
    await db.categories.bulkPut(categories)
    await db.stacks.bulkPut(stacks)
    await db.cards.bulkPut(cards)
  })

  if (remote.settings && typeof window !== 'undefined') {
    // Settings/profile are best-effort: a failure here must not prevent the
    // sync-meta bookkeeping below from running (DB data is already applied).
    try {
      const s = remote.settings
      localStorage.setItem(STORAGE_KEYS.defaultMaxStages, String(s.defaultMaxStages))
      localStorage.setItem(STORAGE_KEYS.theme, s.theme)
      localStorage.setItem(STORAGE_KEYS.colorTheme, s.colorTheme)
      localStorage.setItem(STORAGE_KEYS.notifEnabled, String(s.notifications.enabled))
      localStorage.setItem(STORAGE_KEYS.notifHour, String(s.notifications.hour))
      localStorage.setItem(STORAGE_KEYS.notifMinute, String(s.notifications.minute))

      await updateUserProfile({
        nickname: s.userProfile.nickname,
        avatarEmoji: s.userProfile.avatarEmoji,
        avatarImage: s.userProfile.avatarImage,
      })

      const { getSupabase } = await import('./supabase')
      const sb = getSupabase()
      if (sb) {
        const { data } = await sb.auth.getSession()
        if (data.session?.user && !data.session.user.is_anonymous) {
          await syncLocalProfileFromGoogleUser(data.session.user, data.session)
        }
      }

      await updateNotificationPreferences({ reviewHour: s.notifications.hour }).catch(() => {})
    } catch {
      /* best-effort: keep going so sync meta/streak are still updated */
    }
  }

  if (remote.streak != null) {
    await db.streakMeta.put({
      id: 'meta',
      currentStreak: remote.streak.currentStreak,
      lastSuccessDate: remote.streak.lastSuccessDate,
      longestStreak: remote.streak.longestStreak ?? remote.streak.currentStreak ?? 0,
    })
  }
}

/**
 * Apply a remote backup and align sync meta in one step.
 * If apply succeeds but acknowledge fails, marks conflict pending so uploads
 * stay blocked until the user resolves (avoids silent meta/DB mismatch).
 */
export async function applyRemoteBackupAndAcknowledge(
  remote: DriveBackup,
  remoteModifiedTime?: string | null
): Promise<void> {
  await applyRemoteDataToLocal(remote)
  const { acknowledgeRemoteAfterPull } = await import('./sync/sync-engine')
  try {
    await acknowledgeRemoteAfterPull(remote.exportedAt, remoteModifiedTime)
  } catch (ackErr) {
    await markSyncConflictPending()
    console.error(ackErr)
    throw new Error(
      '데이터는 불러왔지만 동기화 상태 갱신에 실패했습니다. 앱을 다시 열거나 충돌 안내에 따라 선택해 주세요.'
    )
  }
}

function parseDriveBackupResponse(raw: unknown): DriveBackup {
  if (!raw || typeof raw !== 'object' || !('categories' in raw) || !('stacks' in raw) || !('cards' in raw)) {
    throw new Error('백업 파일 형식이 올바르지 않습니다.')
  }
  const backup = raw as DriveBackup
  // A corrupt file (keys present but not arrays) must NOT be coerced to empty
  // arrays — that would silently wipe local data on apply.
  if (
    !Array.isArray(backup.categories) ||
    !Array.isArray(backup.stacks) ||
    !Array.isArray(backup.cards)
  ) {
    throw new Error('백업 파일이 손상되었습니다.')
  }
  return backup
}

/** Delete the real-time sync file from Google Drive (e.g. on "모든 데이터 삭제"). */
export async function deleteDriveBackup(): Promise<void> {
  const token = await getAccessToken()
  if (!token) return
  const file = await findSyncFile(token)
  if (!file) return
  await driveRequest(`${DRIVE_API}/files/${file.id}`, { method: 'DELETE' }, token)
}

/** Download real-time sync file from Google Drive (legacy name; same as downloadSyncFileFromGDrive). */
export async function downloadFromGDrive(): Promise<DriveBackup | null> {
  return downloadSyncFileFromGDrive()
}

/** Restore device from real-time sync file (apply only; no reload). */
export async function restoreFromGDrive(): Promise<DriveBackup> {
  const download = await downloadSyncFileFromGDriveWithMeta()
  if (!download) throw new Error('Google Drive에 백업 파일이 없습니다.')
  await applyRemoteBackupAndAcknowledge(download.backup, download.modifiedTime)
  return download.backup
}

// --- Manual backups (revibe-backup-YYYY-MM-DD-HHmmss.json) ---

function manualBackupFileName(): string {
  const d = new Date()
  const Y = d.getFullYear()
  const M = String(d.getMonth() + 1).padStart(2, '0')
  const D = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${DRIVE_BACKUP_PREFIX}${Y}-${M}-${D}-${h}${m}${s}.json`
}

export interface ManualBackupItem {
  id: string
  name: string
  modifiedTime: string
}

/** Create a dated manual backup file in Drive. Returns the backup label for toast (e.g. "2025년 3월 2일 14:30"). */
export async function createManualBackup(): Promise<{ label: string }> {
  const token = await getAccessToken()
  if (!token) throw new Error('Google 계정이 연결되지 않았습니다.')

  const [categories, stacks, cards, settings, userProfile, streakRow] = await Promise.all([
    db.categories.toArray(),
    db.stacks.toArray(),
    db.cards.toArray(),
    Promise.resolve(readSettingsFromDevice()),
    readUserProfileFromDevice(),
    db.streakMeta.get('meta'),
  ])

  const backup: DriveBackup = {
    version: 2,
    exportedAt: Date.now(),
    categories,
    stacks,
    cards,
    settings: settings
      ? { ...settings, userProfile }
      : {
          defaultMaxStages: 7,
          theme: 'light',
          colorTheme: 'purple',
          notifications: {
            enabled: false,
            hour: DEFAULT_NOTIFICATION_HOUR,
            minute: DEFAULT_NOTIFICATION_MINUTE,
          },
          userProfile,
        },
    streak:
      streakRow != null
        ? { currentStreak: streakRow.currentStreak, lastSuccessDate: streakRow.lastSuccessDate, longestStreak: streakRow.longestStreak ?? streakRow.currentStreak }
        : undefined,
  }

  const name = manualBackupFileName()
  const metadata = { name, parents: ['appDataFolder'] }
  const content = JSON.stringify(backup)
  const form = new FormData()
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  )
  form.append('file', new Blob([content], { type: 'application/json' }))
  await driveRequest(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart`,
    { method: 'POST', body: form },
    token
  )

  const d = new Date()
  const label = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return { label }
}

/** List manual backup files (revibe-backup-*.json), newest first. */
export async function listManualBackups(): Promise<ManualBackupItem[]> {
  const token = await getAccessToken()
  if (!token) throw new Error('Google 계정이 연결되지 않았습니다.')
  const q = `name contains '${DRIVE_BACKUP_PREFIX}'`
  const res = await driveRequest(
    `${DRIVE_API}/files?spaces=appDataFolder&q=${encodeURIComponent(q)}&orderBy=modifiedTime%20desc&fields=files(id,name,modifiedTime)`,
    {},
    token
  )
  const data = await res.json()
  const files = data.files ?? []
  return files.map((f: { id: string; name: string; modifiedTime: string }) => ({
    id: f.id,
    name: f.name,
    modifiedTime: f.modifiedTime,
  }))
}

/** Download a manual backup by file id and parse as DriveBackup. */
export async function downloadManualBackup(fileId: string): Promise<DriveBackup> {
  const token = await getAccessToken()
  if (!token) throw new Error('Google 계정이 연결되지 않았습니다.')
  const res = await driveRequest(
    `${DRIVE_API}/files/${fileId}?alt=media`,
    {},
    token
  )
  const raw = await res.json()
  return parseDriveBackupResponse(raw)
}

/** Delete a manual backup file by id. */
export async function deleteManualBackup(fileId: string): Promise<void> {
  const token = await getAccessToken()
  if (!token) throw new Error('Google 계정이 연결되지 않았습니다.')
  await driveRequest(`${DRIVE_API}/files/${fileId}`, { method: 'DELETE' }, token)
}
