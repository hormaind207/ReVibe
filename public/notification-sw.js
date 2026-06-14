/**
 * ReVibe Push Notification Service Worker
 * Handles incoming Web Push payloads only (no local scheduling).
 */

self.addEventListener('push', (event) => {
  let data = { title: 'ReVibe', body: '', url: '/', tag: 'revibe' }
  try {
    if (event.data) {
      const parsed = event.data.json()
      data = { ...data, ...parsed }
    }
  } catch {
    if (event.data) {
      data.body = event.data.text()
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'revibe',
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          return client.focus().then(() => {
            if ('navigate' in client) client.navigate(url)
          })
        }
      }
      return clients.openWindow(url)
    }),
  )
})

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})
