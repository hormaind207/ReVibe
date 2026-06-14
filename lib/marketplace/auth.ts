'use client'

import { useEffect, useState, useCallback } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import { signInWithGoogleUnified } from '@/lib/google-auth'

export interface MarketplaceUser {
  session: Session | null
  user: User | null
  /** Anonymous (guest) session — can browse/download/like but cannot publish. */
  isAnonymous: boolean
  /** Signed in with Google (full user) — can publish templates. */
  isFullUser: boolean
  nickname: string
  loading: boolean
  configured: boolean
}

function googleNickname(user: User | null): string {
  if (!user) return '익명'
  const meta = user.user_metadata ?? {}
  return (
    (meta.full_name as string) ||
    (meta.name as string) ||
    (meta.user_name as string) ||
    (user.email ? user.email.split('@')[0] : '') ||
    '익명'
  )
}

function googleAvatarUrl(user: User): string | undefined {
  const meta = user.user_metadata ?? {}
  const fromMeta =
    (meta.avatar_url as string) ||
    (meta.picture as string) ||
    (meta.photo as string)
  if (fromMeta) return fromMeta
  const googleIdentity = user.identities?.find((i) => i.provider === 'google')
  const idData = googleIdentity?.identity_data
  if (idData) {
    return (idData.avatar_url as string) || (idData.picture as string) || undefined
  }
  return undefined
}

/** Ensure there is at least an anonymous session so the user can react/download. */
export async function ensureAnonymousSession(): Promise<Session | null> {
  if (
    typeof window !== 'undefined' &&
    (window.location.search.includes('code=') || window.location.search.includes('error='))
  ) {
    return null
  }
  const sb = getSupabase()
  if (!sb) return null
  const { data } = await sb.auth.getSession()
  if (data.session) return data.session
  const { data: anon, error } = await sb.auth.signInAnonymously()
  if (error) {
    console.error('[marketplace] anonymous sign-in failed', error.message)
    return null
  }
  return anon.session
}

/** Unified Google sign-in (Drive + Supabase marketplace). See lib/google-auth.ts */
export { signInWithGoogleUnified as signInWithGoogle } from '@/lib/google-auth'

/** Sign out and immediately drop back to an anonymous session. */
export async function signOutMarketplace(): Promise<void> {
  const sb = getSupabase()
  if (!sb) return
  await sb.auth.signOut()
  await ensureAnonymousSession()
}

/** Upsert the profile row so the publisher nickname (Google name) is stored. */
export async function ensureProfile(user: User): Promise<void> {
  const sb = getSupabase()
  if (!sb || user.is_anonymous) return
  const nickname = googleNickname(user)
  const avatarUrl = googleAvatarUrl(user)
  await sb.from('profiles').upsert(
    {
      id: user.id,
      nickname,
      avatar_url: avatarUrl ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  )
}

/** Update the current full user's publisher nickname. */
export async function updateNickname(nickname: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) return
  const { data } = await sb.auth.getUser()
  if (!data.user || data.user.is_anonymous) return
  await sb.from('profiles').upsert(
    { id: data.user.id, nickname: nickname.trim() || '익명', updated_at: new Date().toISOString() },
    { onConflict: 'id' }
  )
}

/**
 * Marketplace auth hook. Guarantees an anonymous session on mount and keeps the
 * user/session in sync. Also upserts the Google profile once signed in.
 */
export function useMarketplaceUser(): MarketplaceUser {
  const configured = isSupabaseConfigured()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

    useEffect(() => {
    if (!configured) {
      setLoading(false)
      return
    }
    if (
      typeof window !== 'undefined' &&
      (window.location.search.includes('code=') || window.location.search.includes('error='))
    ) {
      setLoading(false)
      return
    }
    const sb = getSupabase()
    if (!sb) {
      setLoading(false)
      return
    }
    let active = true

    ensureAnonymousSession().then((s) => {
      if (active) {
        setSession(s)
        setLoading(false)
      }
    })

    const { data: sub } = sb.auth.onAuthStateChange((event, newSession) => {
      if (!active) return
      setSession(newSession)
      if (newSession?.user && !newSession.user.is_anonymous) {
        ensureProfile(newSession.user).catch(() => {})
        if (
          event === 'SIGNED_IN' ||
          event === 'TOKEN_REFRESHED' ||
          event === 'INITIAL_SESSION' ||
          event === 'USER_UPDATED'
        ) {
          import('@/lib/google-auth')
            .then((m) => m.syncDriveTokenFromSupabaseSession(newSession))
            .catch(() => {})
        }
      }
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [configured])

  const user = session?.user ?? null
  const isAnonymous = Boolean(user?.is_anonymous)
  const isFullUser = Boolean(user && !user.is_anonymous)

  return {
    session,
    user,
    isAnonymous,
    isFullUser,
    nickname: googleNickname(user),
    loading,
    configured,
  }
}

/** Current uid (anonymous or full). Null if not configured. */
export function useCurrentUserId(): string | null {
  const { user } = useMarketplaceUser()
  return user?.id ?? null
}

export { googleNickname }

/** Stable callback wrapper for sign-in (for buttons). */
export function useSignInWithGoogle() {
  return useCallback(() => signInWithGoogleUnified(), [])
}
