'use client'

import { useEffect, useRef } from 'react'
import { flushNotificationSnapshots, markNotificationSnapshotsDirty } from '@/lib/push-notifications'

/** Upload review/streak snapshots on app open and before page hide. */
export function useNotificationSnapshots(dbReady: boolean) {
  const opened = useRef(false)

  useEffect(() => {
    if (!dbReady || opened.current) return
    opened.current = true
    markNotificationSnapshotsDirty()
    flushNotificationSnapshots().catch(() => {})
  }, [dbReady])

  useEffect(() => {
    if (!dbReady) return
    const onHide = () => {
      flushNotificationSnapshots().catch(() => {})
    }
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
  }, [dbReady])
}
