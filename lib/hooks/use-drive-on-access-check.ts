'use client'

import { useEffect, useRef } from 'react'
import { getSyncMeta } from './use-sync-meta'
import { getSyncFileModifiedTime } from '@/lib/sync'

/**
 * On app access (once per session when DB is ready and Google is connected),
 * compare Drive revibe-data.json modifiedTime with lastKnownRemoteModifiedTime.
 * If different, call onConflict so the app can show a choice modal.
 */
export function useDriveOnAccessCheck(dbReady: boolean, onConflict: () => void) {
  const hasCheckedThisSession = useRef(false)
  const onConflictRef = useRef(onConflict)
  onConflictRef.current = onConflict

  useEffect(() => {
    if (!dbReady || hasCheckedThisSession.current) return
    if (typeof window === 'undefined') return
    if (window.sessionStorage.getItem('google_just_connected') === '1') return

    hasCheckedThisSession.current = true

    const check = async () => {
      const meta = await getSyncMeta()
      if (!meta?.googleAccessToken) return
      if (meta.googleTokenExpiry && meta.googleTokenExpiry < Date.now()) return

      const remoteModified = await getSyncFileModifiedTime()
      if (!remoteModified) return

      const lastKnown = meta.lastKnownRemoteModifiedTime ?? null
      if (lastKnown !== null && remoteModified === lastKnown) return

      onConflictRef.current()
    }

    check().catch(() => {})
  }, [dbReady])
}
