'use client'

import { useEffect, useRef } from 'react'
import { GOOGLE_REAUTH_SESSION_KEY, isGoogleConnectFlowPending } from '@/lib/google-auth'
import { syncOnAppOpen } from '@/lib/sync/sync-on-open'

/**
 * On app access (once per session when DB is ready and Google is connected),
 * run smart open sync: silent pull, upload pending, or conflict modal.
 */
export function useDriveOnAccessCheck(
  dbReady: boolean,
  onConflict: () => void,
  onPulled?: () => void
) {
  const hasCheckedThisSession = useRef(false)
  const onConflictRef = useRef(onConflict)
  const onPulledRef = useRef(onPulled)
  onConflictRef.current = onConflict
  onPulledRef.current = onPulled

  useEffect(() => {
    if (!dbReady || hasCheckedThisSession.current) return
    if (typeof window === 'undefined') return

    const isReauth = sessionStorage.getItem(GOOGLE_REAUTH_SESSION_KEY) === '1'
    if (!isReauth && isGoogleConnectFlowPending()) return

    hasCheckedThisSession.current = true
    if (isReauth) sessionStorage.removeItem(GOOGLE_REAUTH_SESSION_KEY)

    syncOnAppOpen()
      .then((result) => {
        if (result === 'conflict') onConflictRef.current()
        if (result === 'pulled') onPulledRef.current?.()
      })
      .catch(() => {})
  }, [dbReady])
}
