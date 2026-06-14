'use client'

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import { getTodayReviewCounts } from '@/lib/review-due'
import { getStreakMeta } from '@/lib/streak'
import { getTodayReviewStacks } from '@/lib/leitner'
import { today } from '@/lib/db'

const SW_URL = '/notification-sw.js'
const LEGACY_MIGRATION_KEY = 'push_notifications_migrated_v1'

export const DEFAULT_REVIEW_HOUR = 9

export interface NotificationPreferences {
  masterEnabled: boolean
  reviewEnabled: boolean
  reviewHour: number
  streakEnabled: boolean
  rankingEnabled: boolean
  marketplaceLikesEnabled: boolean
  timezone: string
}

const DEFAULT_PREFS: NotificationPreferences = {
  masterEnabled: false,
  reviewEnabled: false,
  reviewHour: DEFAULT_REVIEW_HOUR,
  streakEnabled: false,
  rankingEnabled: false,
  marketplaceLikesEnabled: false,
  timezone: typeof Intl !== 'undefined'
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : 'Asia/Seoul',
}

function mapPrefs(row: {
  master_enabled: boolean
  review_enabled: boolean
  review_hour: number
  streak_enabled: boolean
  ranking_enabled: boolean
  marketplace_likes_enabled: boolean
  timezone: string
}): NotificationPreferences {
  return {
    masterEnabled: row.master_enabled,
    reviewEnabled: row.review_enabled,
    reviewHour: row.review_hour,
    streakEnabled: row.streak_enabled,
    rankingEnabled: row.ranking_enabled,
    marketplaceLikesEnabled: row.marketplace_likes_enabled,
    timezone: row.timezone,
  }
}

export function getVapidPublicKey(): string | null {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  return key?.trim() || null
}

/** One-time: legacy localStorage notifications=true → off on server. */
export async function migrateLegacyNotificationSettings(): Promise<void> {
  if (typeof window === 'undefined') return
  if (localStorage.getItem(LEGACY_MIGRATION_KEY) === '1') return
  localStorage.setItem(LEGACY_MIGRATION_KEY, '1')
  localStorage.setItem('notifications', 'false')

  const sb = getSupabase()
  if (!sb) return
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return

  await sb.rpc('update_notification_preferences', {
    p_patch: {
      master_enabled: false,
      review_enabled: false,
      streak_enabled: false,
      ranking_enabled: false,
      marketplace_likes_enabled: false,
    },
  })
}

const PREFS_CACHE_KEY = 'notif_prefs_cache_v1'
const PREFS_CACHE_TTL_MS = 5 * 60 * 1000

let prefsMemoryCache: { prefs: NotificationPreferences; at: number } | null = null

function readPrefsCache(): NotificationPreferences | null {
  if (prefsMemoryCache && Date.now() - prefsMemoryCache.at < PREFS_CACHE_TTL_MS) {
    return prefsMemoryCache.prefs
  }
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(PREFS_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { prefs: NotificationPreferences; at: number }
    if (Date.now() - parsed.at >= PREFS_CACHE_TTL_MS) return null
    prefsMemoryCache = parsed
    return parsed.prefs
  } catch {
    return null
  }
}

function writePrefsCache(prefs: NotificationPreferences): void {
  const entry = { prefs, at: Date.now() }
  prefsMemoryCache = entry
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(PREFS_CACHE_KEY, JSON.stringify(entry))
    } catch {
      /* quota */
    }
  }
}

function invalidatePrefsCache(): void {
  prefsMemoryCache = null
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(PREFS_CACHE_KEY)
    } catch {
      /* ignore */
    }
  }
}

let snapshotDirty = false
let lastFlushedAt = 0
let flushInFlight: Promise<void> | null = null
const SNAPSHOT_FLUSH_DEDUPE_MS = 5000

/** Mark review/streak snapshots stale after local data changes. */
export function markNotificationSnapshotsDirty(): void {
  snapshotDirty = true
}

async function notificationsEnabledForSnapshots(): Promise<boolean> {
  if (!isSupabaseConfigured() || !getVapidPublicKey()) return false
  const prefs = await getNotificationPreferences()
  return prefs.masterEnabled
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const cached = readPrefsCache()
  if (cached) return cached
  if (!isSupabaseConfigured()) return { ...DEFAULT_PREFS }
  const sb = getSupabase()
  if (!sb) return { ...DEFAULT_PREFS }
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ...DEFAULT_PREFS }

  await migrateLegacyNotificationSettings()

  const { data, error } = await sb.rpc('get_notification_preferences')
  if (error || !data || (data as unknown[]).length === 0) {
    const fallback = { ...DEFAULT_PREFS, timezone: DEFAULT_PREFS.timezone }
    writePrefsCache(fallback)
    return fallback
  }
  const prefs = mapPrefs((data as Record<string, unknown>[])[0] as Parameters<typeof mapPrefs>[0])
  writePrefsCache(prefs)
  return prefs
}

export async function updateNotificationPreferences(
  patch: Partial<NotificationPreferences>,
): Promise<boolean> {
  const sb = getSupabase()
  if (!sb) return false
  const body: Record<string, unknown> = {}
  if (patch.masterEnabled !== undefined) body.master_enabled = patch.masterEnabled
  if (patch.reviewEnabled !== undefined) body.review_enabled = patch.reviewEnabled
  if (patch.reviewHour !== undefined) body.review_hour = patch.reviewHour
  if (patch.streakEnabled !== undefined) body.streak_enabled = patch.streakEnabled
  if (patch.rankingEnabled !== undefined) body.ranking_enabled = patch.rankingEnabled
  if (patch.marketplaceLikesEnabled !== undefined) {
    body.marketplace_likes_enabled = patch.marketplaceLikesEnabled
  }
  if (patch.timezone !== undefined) body.timezone = patch.timezone
  else if (typeof Intl !== 'undefined') {
    body.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  }

  const { data, error } = await sb.rpc('update_notification_preferences', { p_patch: body })
  const ok = !error && data === true
  if (ok) invalidatePrefsCache()
  return ok
}

async function getOrRegisterSW(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    const found = await findPushSWRegistrations()
    if (found.length > 0) return found[0]
    return await navigator.serviceWorker.register(SW_URL, { scope: '/' })
  } catch (err) {
    console.error('[ReVibe] push SW registration failed:', err)
    return null
  }
}

function isNotificationSWRegistration(reg: ServiceWorkerRegistration): boolean {
  const urls = [
    reg.active?.scriptURL,
    reg.installing?.scriptURL,
    reg.waiting?.scriptURL,
  ]
  return urls.some((url) => url?.includes('notification-sw'))
}

async function findPushSWRegistrations(): Promise<ServiceWorkerRegistration[]> {
  if (!('serviceWorker' in navigator)) return []
  const existing = await navigator.serviceWorker.getRegistrations()
  return existing.filter(isNotificationSWRegistration)
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export async function subscribeToPush(): Promise<'granted' | 'denied' | 'unsupported' | 'no_vapid'> {
  if (!('Notification' in window) || !('PushManager' in window)) return 'unsupported'
  const vapid = getVapidPublicKey()
  if (!vapid) return 'no_vapid'

  const permission =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'

  const reg = await getOrRegisterSW()
  if (!reg) return 'unsupported'
  await navigator.serviceWorker.ready

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid),
    })
  }

  const json = sub.toJSON()
  const endpoint = json.endpoint
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!endpoint || !p256dh || !auth) return 'unsupported'

  const sb = getSupabase()
  if (!sb) return 'unsupported'
  await sb.rpc('upsert_push_subscription', {
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth_key: auth,
    p_user_agent: navigator.userAgent,
  })

  return 'granted'
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const sb = getSupabase()
  const regs = await findPushSWRegistrations()
  for (const reg of regs) {
    const sub = await reg.pushManager.getSubscription()
    if (!sub) continue
    const endpoint = sub.endpoint
    await sub.unsubscribe()
    if (sb && endpoint) {
      await sb.rpc('delete_push_subscription', { p_endpoint: endpoint })
    }
  }
}

export async function syncReviewSnapshot(): Promise<void> {
  const sb = getSupabase()
  if (!sb) return
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return

  const { dueDate, cardCount, stackCount } = await getTodayReviewCounts()
  await sb.rpc('upsert_review_snapshot', {
    p_due_date: dueDate,
    p_card_count: cardCount,
    p_stack_count: stackCount,
  })
}

export async function syncStreakSnapshot(): Promise<void> {
  const sb = getSupabase()
  if (!sb) return
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return

  const asOfDate = today()
  const meta = await getStreakMeta()
  const dueStacks = await getTodayReviewStacks()
  const hasDueToday = dueStacks.length > 0

  await sb.rpc('upsert_streak_snapshot', {
    p_as_of_date: asOfDate,
    p_current_streak: meta.currentStreak,
    p_last_success_date: meta.lastSuccessDate,
    p_has_due_today: hasDueToday,
  })
}

export async function flushNotificationSnapshots(opts?: { force?: boolean }): Promise<void> {
  if (!opts?.force && !snapshotDirty) return
  if (!opts?.force && Date.now() - lastFlushedAt < SNAPSHOT_FLUSH_DEDUPE_MS) return
  if (!(await notificationsEnabledForSnapshots())) return
  if (flushInFlight) return flushInFlight

  flushInFlight = (async () => {
    try {
      await Promise.all([syncReviewSnapshot(), syncStreakSnapshot()])
      snapshotDirty = false
      lastFlushedAt = Date.now()
    } finally {
      flushInFlight = null
    }
  })()
  return flushInFlight
}

/** Enable master + subscribe + default timezone. */
export async function enableMasterNotifications(): Promise<
  'granted' | 'denied' | 'unsupported' | 'no_vapid' | 'error'
> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const subResult = await subscribeToPush()
  if (subResult !== 'granted') return subResult

  // If saving prefs fails, roll back the push subscription so we don't end up
  // subscribed-but-disabled (an inconsistent state the UI can't recover from).
  let prefsOk = false
  try {
    prefsOk = await updateNotificationPreferences({
      masterEnabled: true,
      timezone: tz,
    })
  } catch {
    prefsOk = false
  }
  if (!prefsOk) {
    await unsubscribeFromPush().catch(() => {})
    return 'error'
  }

  markNotificationSnapshotsDirty()
  await flushNotificationSnapshots({ force: true })
  return 'granted'
}

/** Disable master, all sub-toggles, and unsubscribe. */
export async function disableMasterNotifications(): Promise<void> {
  await unsubscribeFromPush()
  await updateNotificationPreferences({
    masterEnabled: false,
    reviewEnabled: false,
    streakEnabled: false,
    rankingEnabled: false,
    marketplaceLikesEnabled: false,
  })
}

export async function sendTestPushNotification(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false
  // Prefer the dedicated notification SW (navigator.serviceWorker.ready may
  // resolve to a different/default SW when multiple are registered).
  const regs = await findPushSWRegistrations()
  const reg = regs[0] ?? (await navigator.serviceWorker.ready)
  await reg.showNotification('ReVibe 알림 테스트', {
    body: '알림이 정상적으로 동작하고 있어요!',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'revibe-test',
    data: { url: '/' },
  })
  return true
}

let snapshotDebounce: ReturnType<typeof setTimeout> | null = null

/** Debounced snapshot upload after data changes. */
export function scheduleSnapshotSync(): void {
  if (typeof window === 'undefined') return
  markNotificationSnapshotsDirty()
  void notificationsEnabledForSnapshots().then((enabled) => {
    if (!enabled) return
    if (snapshotDebounce) clearTimeout(snapshotDebounce)
    snapshotDebounce = setTimeout(() => {
      snapshotDebounce = null
      flushNotificationSnapshots().catch(() => {})
    }, 30_000)
  })
}
