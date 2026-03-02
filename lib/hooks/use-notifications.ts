'use client'

import { useEffect, useRef, useCallback } from 'react'

const SW_URL = '/notification-sw.js'
const STORAGE_KEY_ENABLED = 'notifications'
const STORAGE_KEY_HOUR = 'notification_hour'
const STORAGE_KEY_MINUTE = 'notification_minute'

export const DEFAULT_NOTIFICATION_HOUR = 9
export const DEFAULT_NOTIFICATION_MINUTE = 0

/** Register the notification service worker and return its registration. */
async function getOrRegisterSW(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    // Check if already registered
    const existing = await navigator.serviceWorker.getRegistrations()
    const found = existing.find((r) => r.active?.scriptURL.includes('notification-sw'))
    if (found) return found
    return await navigator.serviceWorker.register(SW_URL, { scope: '/' })
  } catch (err) {
    console.error('[ReVibe] notification SW registration failed:', err)
    return null
  }
}

/** Send a message to the notification SW. */
async function sendToSW(message: Record<string, unknown>) {
  const reg = await getOrRegisterSW()
  if (!reg) return
  const target = reg.active ?? reg.waiting ?? reg.installing
  target?.postMessage(message)
}

/** Enable notifications: request permission, register SW, schedule. */
export async function enableNotifications(hour = DEFAULT_NOTIFICATION_HOUR, minute = DEFAULT_NOTIFICATION_MINUTE): Promise<'granted' | 'denied' | 'unsupported'> {
  if (!('Notification' in window)) return 'unsupported'

  const permission =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission()

  if (permission !== 'granted') return 'denied'

  localStorage.setItem(STORAGE_KEY_ENABLED, 'true')
  localStorage.setItem(STORAGE_KEY_HOUR, String(hour))
  localStorage.setItem(STORAGE_KEY_MINUTE, String(minute))

  await sendToSW({ type: 'SCHEDULE_NOTIFICATION', hour, minute })
  return 'granted'
}

/** Disable notifications: cancel scheduled SW timer. */
export async function disableNotifications() {
  localStorage.setItem(STORAGE_KEY_ENABLED, 'false')
  await sendToSW({ type: 'CANCEL_NOTIFICATION' })
}

/** Re-schedule with new time (keeps notifications enabled). */
export async function updateNotificationTime(hour: number, minute: number) {
  localStorage.setItem(STORAGE_KEY_HOUR, String(hour))
  localStorage.setItem(STORAGE_KEY_MINUTE, String(minute))
  await sendToSW({ type: 'SCHEDULE_NOTIFICATION', hour, minute })
}

/** Trigger a test notification immediately. */
export async function sendTestNotification() {
  await sendToSW({ type: 'SHOW_NOW' })
}

/** Send an overdue (missed review) reminder notification. */
export async function sendOverdueNotification(overdueCount: number) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  await sendToSW({ type: 'OVERDUE_NOTIFICATION', overdueCount })
}

/**
 * On app start: if notifications were previously enabled,
 * re-register the SW and reschedule (SW loses timeouts when terminated).
 */
export function useNotificationRestore() {
  const restored = useRef(false)

  useEffect(() => {
    if (restored.current) return
    restored.current = true

    const enabled = localStorage.getItem(STORAGE_KEY_ENABLED) === 'true'
    if (!enabled) return

    const hour = Number(localStorage.getItem(STORAGE_KEY_HOUR) ?? DEFAULT_NOTIFICATION_HOUR)
    const minute = Number(localStorage.getItem(STORAGE_KEY_MINUTE) ?? DEFAULT_NOTIFICATION_MINUTE)

    // Re-schedule silently; permission must already be granted
    if (typeof window !== 'undefined' && Notification.permission === 'granted') {
      sendToSW({ type: 'SCHEDULE_NOTIFICATION', hour, minute }).catch(() => {})
    }
  }, [])
}

/** Returns saved notification settings from localStorage. */
export function getNotificationSettings() {
  if (typeof window === 'undefined') {
    return { enabled: false, hour: DEFAULT_NOTIFICATION_HOUR, minute: DEFAULT_NOTIFICATION_MINUTE }
  }
  return {
    enabled: localStorage.getItem(STORAGE_KEY_ENABLED) === 'true',
    hour: Number(localStorage.getItem(STORAGE_KEY_HOUR) ?? DEFAULT_NOTIFICATION_HOUR),
    minute: Number(localStorage.getItem(STORAGE_KEY_MINUTE) ?? DEFAULT_NOTIFICATION_MINUTE),
  }
}
