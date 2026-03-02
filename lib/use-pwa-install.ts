'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** Whether the app is running as an installed PWA (standalone). */
export function useIsPwa(): boolean {
  const [isPwa, setIsPwa] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true ||
      document.referrer.includes('android-app://')

    setIsPwa(standalone)
  }, [])

  return isPwa
}

/** Captures beforeinstallprompt and provides triggerInstall. */
export function useDeferredInstallPrompt(): {
  canInstall: boolean
  triggerInstall: () => Promise<'accepted' | 'dismissed' | 'unsupported'>
} {
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null)
  const [canInstall, setCanInstall] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      deferredRef.current = e as BeforeInstallPromptEvent
      setCanInstall(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      deferredRef.current = null
    }
  }, [])

  const triggerInstall = useCallback(async (): Promise<
    'accepted' | 'dismissed' | 'unsupported'
  > => {
    const event = deferredRef.current
    if (!event) return 'unsupported'
    await event.prompt()
    const { outcome } = await event.userChoice
    deferredRef.current = null
    setCanInstall(false)
    return outcome
  }, [])

  return { canInstall, triggerInstall }
}
