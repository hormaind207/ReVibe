'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { db } from './db'
import { seedDatabase } from './seed'
import { handleOAuthCallback } from './oauth-handler'
import { isSupabaseConfigured } from './supabase'
import {
  completeSupabaseOAuthIfNeeded,
  initGoogleFromSupabaseSession,
  isOAuthCallbackUrl,
  syncDriveTokenFromSupabaseSession,
} from './google-auth'

type DBReadyState = 'loading' | 'ready' | 'error'

const DBReadyContext = createContext<DBReadyState>('loading')

export function DBReadyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DBReadyState>('loading')

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        // 1. PKCE code exchange before any other Supabase usage (anon session, etc.)
        const oauthSession = isOAuthCallbackUrl()
          ? await completeSupabaseOAuthIfNeeded()
          : null

        // 2. Open IndexedDB — profile sync writes to Dexie
        await db.open()
        await seedDatabase()

        // 3. Legacy Drive hash OAuth (Supabase 미설정 시만) + Supabase session sync
        const legacyDriveLogin = isSupabaseConfigured()
          ? false
          : await handleOAuthCallback()
        let supabaseLogin = false
        if (!legacyDriveLogin) {
          if (oauthSession?.user && !oauthSession.user.is_anonymous) {
            await syncDriveTokenFromSupabaseSession(oauthSession)
            supabaseLogin = true
          } else {
            supabaseLogin = await initGoogleFromSupabaseSession()
          }
        }
        if (legacyDriveLogin || supabaseLogin) {
          window.history.replaceState(null, '', '/#/profile')
        }

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
