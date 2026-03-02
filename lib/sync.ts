/**
 * Google Drive Sync Module
 *
 * - Real-time sync: revibe-data.json — upload on data change; poll and pull when modified by another device (no reload).
 * - Manual backups: revibe-backup-YYYY-MM-DD-HHmmss.json — create/list/restore/delete separately.
 */

import { db } from './db'
import { updateSyncMeta, getSyncMeta } from './hooks/use-sync-meta'
import { updateUserProfile } from './hooks/use-user-profile'
import {
  DEFAULT_NOTIFICATION_HOUR,
  DEFAULT_NOTIFICATION_MINUTE,
} from './hooks/use-notifications'
import { enableNotifications, disableNotifications } from './hooks/use-notifications'

const DRIVE_SYNC_FILE_NAME = 'revibe-data.json'
const DRIVE_BACKUP_PREFIX = 'revibe-backup-'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'

const STORAGE_KEYS = {
  defaultMaxStages: 'defaultMaxStages',
  devMode: 'dev_mode',
  theme: 'theme',
  colorTheme: 'color-theme',
  notifEnabled: 'notifications',
  notifHour: 'notification_hour',
  notifMinute: 'notification_minute',
} as const

export interface DriveBackupSettings {
  defaultMaxStages: number
  devMode: boolean
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
  streak?: { currentStreak: number; lastSuccessDate: string | null }
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
  const devMode = localStorage.getItem(STORAGE_KEYS.devMode) === 'true'
  const theme = localStorage.getItem(STORAGE_KEYS.theme) ?? 'system'
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
    devMode,
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
          devMode: false,
          theme: 'system',
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
        ? { currentStreak: streakRow.currentStreak, lastSuccessDate: streakRow.lastSuccessDate }
        : undefined,
  }

  const content = JSON.stringify(backup)
  const existing = await findSyncFile(token)

  if (existing) {
    await driveRequest(
      `${DRIVE_UPLOAD_API}/files/${existing.id}?uploadType=media`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: content,
      },
      token
    )
  } else {
    const metadata = { name: DRIVE_SYNC_FILE_NAME, parents: ['appDataFolder'] }
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
  }

  const after = await findSyncFile(token)
  await updateSyncMeta({
    lastSyncedAt: Date.now(),
    lastKnownRemoteModifiedTime: after?.modifiedTime ?? null,
  })
}

/** Get remote modifiedTime of the real-time sync file (for pull detection). */
export async function getSyncFileModifiedTime(): Promise<string | null> {
  const token = await getAccessToken()
  if (!token) return null
  const file = await findSyncFile(token)
  return file?.modifiedTime ?? null
}

/** Download real-time sync file and parse as DriveBackup. */
export async function downloadSyncFileFromGDrive(): Promise<DriveBackup | null> {
  const token = await getAccessToken()
  if (!token) throw new Error('Google 계정이 연결되지 않았습니다.')
  const file = await findSyncFile(token)
  if (!file) return null
  const res = await driveRequest(
    `${DRIVE_API}/files/${file.id}?alt=media`,
    {},
    token
  )
  return parseDriveBackupResponse(await res.json())
}

/** Apply remote backup data to local DB and settings (no reload). */
export async function applyRemoteDataToLocal(remote: DriveBackup): Promise<void> {
  await db.transaction('rw', [db.categories, db.stacks, db.cards], async () => {
    await db.cards.clear()
    await db.stacks.clear()
    await db.categories.clear()
    await db.categories.bulkPut(
      remote.categories as Parameters<typeof db.categories.bulkPut>[0]
    )
    await db.stacks.bulkPut(
      remote.stacks as Parameters<typeof db.stacks.bulkPut>[0]
    )
    await db.cards.bulkPut(
      remote.cards as Parameters<typeof db.cards.bulkPut>[0]
    )
  })

  if (remote.settings && typeof window !== 'undefined') {
    const s = remote.settings
    localStorage.setItem(STORAGE_KEYS.defaultMaxStages, String(s.defaultMaxStages))
    localStorage.setItem(STORAGE_KEYS.devMode, String(s.devMode))
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

    if (s.notifications.enabled) {
      await enableNotifications(s.notifications.hour, s.notifications.minute)
    } else {
      await disableNotifications()
    }
  }

  if (remote.streak != null) {
    await db.streakMeta.put({
      id: 'meta',
      currentStreak: remote.streak.currentStreak,
      lastSuccessDate: remote.streak.lastSuccessDate,
    })
  }

  await updateSyncMeta({ lastSyncedAt: Date.now() })
}

function parseDriveBackupResponse(raw: unknown): DriveBackup {
  if (!raw || typeof raw !== 'object' || !('categories' in raw) || !('stacks' in raw) || !('cards' in raw)) {
    throw new Error('백업 파일 형식이 올바르지 않습니다.')
  }
  const backup = raw as DriveBackup
  if (!Array.isArray(backup.categories)) backup.categories = []
  if (!Array.isArray(backup.stacks)) backup.stacks = []
  if (!Array.isArray(backup.cards)) backup.cards = []
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
  const remote = await downloadSyncFileFromGDrive()
  if (!remote) throw new Error('Google Drive에 백업 파일이 없습니다.')
  await applyRemoteDataToLocal(remote)
  return remote
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
          devMode: false,
          theme: 'system',
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
        ? { currentStreak: streakRow.currentStreak, lastSuccessDate: streakRow.lastSuccessDate }
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
