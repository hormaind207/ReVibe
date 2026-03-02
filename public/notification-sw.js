/**
 * ReVibe Notification Service Worker
 * Handles scheduled review reminder notifications.
 * Reads IndexedDB directly to check for due review stacks.
 */

const DB_NAME = 'VibeLeitnerDB'
let scheduledTimeoutId = null

// Open the app's IndexedDB
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// Get today's due card count from IndexedDB
async function getTodayReviewInfo() {
  try {
    const db = await openDB()
    const today = new Date().toISOString().slice(0, 10)

    const stacks = await new Promise((resolve) => {
      const tx = db.transaction('stacks', 'readonly')
      const req = tx.objectStore('stacks').getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve([])
    })

    const dueStacks = stacks.filter(s => !s.isCompleted && s.nextReviewDate <= today)
    if (dueStacks.length === 0) return { stackCount: 0, cardCount: 0 }

    const cards = await new Promise((resolve) => {
      const tx = db.transaction('cards', 'readonly')
      const req = tx.objectStore('cards').getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve([])
    })

    const dueStackIds = new Set(dueStacks.map(s => s.id))
    const dueCards = cards.filter(c => dueStackIds.has(c.stackId))

    return { stackCount: dueStacks.length, cardCount: dueCards.length }
  } catch {
    return { stackCount: 0, cardCount: 0 }
  }
}

// Show notification if there are due cards
async function showReviewNotification() {
  const { stackCount, cardCount } = await getTodayReviewInfo()
  if (cardCount === 0) return

  const messages = [
    `오늘 복습할 카드가 ${cardCount}장 있어요! 🧠`,
    `${cardCount}장의 카드가 기다리고 있어요. 잊기 전에 복습해요!`,
    `복습 시간이에요! 오늘 ${cardCount}장, ${stackCount}개 스택을 복습해요.`,
  ]
  const body = messages[Math.floor(Math.random() * messages.length)]

  await self.registration.showNotification('ReVibe 복습 알림 🧠', {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'revibe-review-reminder',
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: '/' },
  })
}

// Schedule next notification at the given hour:minute
function scheduleNext(hour, minute) {
  if (scheduledTimeoutId !== null) {
    clearTimeout(scheduledTimeoutId)
    scheduledTimeoutId = null
  }

  const now = new Date()
  const target = new Date()
  target.setHours(hour, minute, 0, 0)

  // If today's time already passed, schedule for tomorrow
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1)
  }

  const delay = target.getTime() - now.getTime()

  scheduledTimeoutId = setTimeout(async () => {
    await showReviewNotification()
    // Reschedule for the next day
    scheduleNext(hour, minute)
  }, delay)
}

// ── Message handler ────────────────────────────────────────────────
self.addEventListener('message', async (event) => {
  const { type, hour, minute } = event.data ?? {}

  if (type === 'SCHEDULE_NOTIFICATION') {
    scheduleNext(hour ?? 9, minute ?? 0)
    // Also check immediately if there are due cards (for same-day first use)
    const { cardCount } = await getTodayReviewInfo()
    event.source?.postMessage({ type: 'SCHEDULE_ACK', cardCount })
  }

  if (type === 'CANCEL_NOTIFICATION') {
    if (scheduledTimeoutId !== null) clearTimeout(scheduledTimeoutId)
    scheduledTimeoutId = null
  }

  if (type === 'SHOW_NOW') {
    await showReviewNotification()
  }

  if (type === 'CHECK_DUE') {
    const info = await getTodayReviewInfo()
    event.source?.postMessage({ type: 'DUE_INFO', ...info })
  }

  if (type === 'OVERDUE_NOTIFICATION') {
    const { overdueCount } = event.data ?? {}
    const count = overdueCount ?? 1
    await self.registration.showNotification('ReVibe 미복습 알림 ⚠️', {
      body: `어제 못 한 복습이 ${count}개 있어요! 오늘 꼭 복습해 주세요.`,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'revibe-overdue-reminder',
      renotify: true,
      vibrate: [300, 100, 300, 100, 300],
      data: { url: '/' },
    })
  }
})

// ── Notification click ─────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // Focus existing window if open
      for (const client of list) {
        if ('focus' in client) return client.focus()
      }
      // Otherwise open new window
      return clients.openWindow('/')
    })
  )
})

// ── Install / Activate ─────────────────────────────────────────────
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})
