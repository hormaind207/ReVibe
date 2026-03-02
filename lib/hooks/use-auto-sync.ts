'use client'

import { useEffect, useRef } from 'react'
import { getSyncMeta } from './use-sync-meta'
import { uploadToGDrive } from '../sync'

const SYNC_COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes

export function useAutoSync() {
  const lastSyncAttempt = useRef<number>(0)

  const trySync = async () => {
    const now = Date.now()
    if (now - lastSyncAttempt.current < SYNC_COOLDOWN_MS) return

    const meta = await getSyncMeta()
    if (!meta?.googleAccessToken) return
    if (meta.googleTokenExpiry && meta.googleTokenExpiry < now) return

    lastSyncAttempt.current = now

    try {
      await uploadToGDrive()
    } catch {
      // Silent fail for auto-sync
    }
  }

  useEffect(() => {
    // Sync on app focus
    const onFocus = () => { trySync() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) trySync()
    })

    // Initial sync after 2 seconds
    const timer = setTimeout(() => trySync(), 2000)

    return () => {
      window.removeEventListener('focus', onFocus)
      clearTimeout(timer)
    }
  }, [])
}
