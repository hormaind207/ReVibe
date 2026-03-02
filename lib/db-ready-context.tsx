'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { db } from './db'
import { seedDatabase } from './seed'
import { handleOAuthCallback } from './oauth-handler'

type DBReadyState = 'loading' | 'ready' | 'error'

const DBReadyContext = createContext<DBReadyState>('loading')

export function DBReadyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DBReadyState>('loading')

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        // 1. Handle Google OAuth redirect callback if present in the URL.
        //    Must happen before NavigationProvider mounts so the initial
        //    screen can be set to profile after a successful login.
        const justLoggedIn = await handleOAuthCallback()
        if (justLoggedIn) {
          // Point the URL to the profile screen so NavigationProvider
          // starts there, showing the user their newly connected account.
          window.history.replaceState(null, '', '/#/profile')
        }

        // 2. Open IndexedDB (triggers version migration if needed)
        await db.open()

        // 3. Seed initial data (no-op if DB already has data)
        await seedDatabase()

        if (!cancelled) setState('ready')
      } catch (err) {
        console.error('[DBReadyProvider] Initialization failed:', err)
        if (!cancelled) setState('error')
      }
    }

    init()
    return () => { cancelled = true }
  }, [])

  return (
    <DBReadyContext.Provider value={state}>
      {children}
    </DBReadyContext.Provider>
  )
}

export function useDBReady(): DBReadyState {
  return useContext(DBReadyContext)
}
