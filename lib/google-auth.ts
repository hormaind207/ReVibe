'use client'

import type { Session, User } from '@supabase/supabase-js'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import { updateSyncMeta, clearGoogleAuth, getSyncMeta, isGoogleTokenValid } from '@/lib/hooks/use-sync-meta'
import { updateUserProfile } from '@/lib/hooks/use-user-profile'
import { ensureAnonymousSession, ensureProfile } from '@/lib/marketplace/auth'

/** Google 계정 표시 이름 (로컬 프로필·마켓 닉네임과 동일 규칙) */
export function googleDisplayNameFromUser(user: User): string {
  const meta = user.user_metadata ?? {}
  return (
    (meta.full_name as string) ||
    (meta.name as string) ||
    (meta.user_name as string) ||
    (user.email ? user.email.split('@')[0] : '') ||
    '게스트'
  )
}

/** Google 프로필 사진 URL (user_metadata + identities) */
export function googleAvatarFromUser(user: User): string | undefined {
  const meta = user.user_metadata ?? {}
  const fromMeta =
    (meta.avatar_url as string) ||
    (meta.picture as string) ||
    (meta.photo as string)
  if (fromMeta) return fromMeta

  const googleIdentity = user.identities?.find((i) => i.provider === 'google')
  const idData = googleIdentity?.identity_data
  if (idData) {
    return (
      (idData.avatar_url as string) ||
      (idData.picture as string) ||
      undefined
    )
  }
  return undefined
}

/** 로컬 Dexie avatarImage 또는 Supabase Google 세션에서 표시용 URL */
export function resolveProfileAvatarUrl(
  localAvatar: string | undefined,
  user: User | null | undefined
): string | undefined {
  if (localAvatar) return localAvatar
  if (!user || user.is_anonymous) return undefined
  return googleAvatarFromUser(user)
}

async function fetchGooglePictureFromToken(accessToken: string): Promise<string | undefined> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return undefined
    const data = (await res.json()) as { picture?: string }
    return data.picture || undefined
  } catch {
    return undefined
  }
}

/** Google 로그인 시 로컬 Dexie 프로필(닉네임·프사) 동기화 */
export async function syncLocalProfileFromGoogleUser(
  user: User,
  session?: Session | null
): Promise<void> {
  if (user.is_anonymous) return

  let avatar = googleAvatarFromUser(user)
  if (!avatar && session?.provider_token) {
    avatar = await fetchGooglePictureFromToken(session.provider_token)
  }

  const updates: Partial<{ nickname: string; avatarImage: string }> = {
    nickname: googleDisplayNameFromUser(user),
  }
  if (avatar) updates.avatarImage = avatar

  await updateUserProfile(updates)
}

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
const GOOGLE_SCOPES = `email profile ${DRIVE_SCOPE}`

/** Session flag: first Google connect — profile handles open sync until cleared. */
export const GOOGLE_JUST_CONNECTED_KEY = 'google_just_connected'
/** After Google sign-out, use signInWithOAuth (not linkIdentity) on next login. */
const GOOGLE_REAUTH_KEY = 'google_use_oauth_signin'
const GOOGLE_OAUTH_RETRY_KEY = 'google_oauth_retry_done'
/** Session flag: user signed out and re-logged in — skip first-connect restore flow. */
export const GOOGLE_REAUTH_SESSION_KEY = 'google_reauth'
const GOOGLE_EVER_CONNECTED_KEY = 'google_ever_connected'

export function isGoogleConnectFlowPending(): boolean {
  return (
    typeof window !== 'undefined' &&
    sessionStorage.getItem(GOOGLE_JUST_CONNECTED_KEY) === '1'
  )
}

export function clearGoogleEverConnectedFlag(): void {
  if (typeof window !== 'undefined') localStorage.removeItem(GOOGLE_EVER_CONNECTED_KEY)
}

function hasEverConnectedGoogle(): boolean {
  return typeof window !== 'undefined' && localStorage.getItem(GOOGLE_EVER_CONNECTED_KEY) === '1'
}

function markEverConnectedGoogle(): void {
  if (typeof window !== 'undefined') localStorage.setItem(GOOGLE_EVER_CONNECTED_KEY, '1')
}

function getGoogleOAuthOptions(
  redirectTo: string | undefined,
  opts?: { forceConsent?: boolean; firstConnect?: boolean }
) {
  const prompt =
    opts?.forceConsent || opts?.firstConnect ? ('consent' as const) : ('select_account' as const)
  return {
    redirectTo,
    scopes: GOOGLE_SCOPES,
    queryParams: { access_type: 'offline' as const, prompt },
  }
}

function shouldUseOAuthSignIn(): boolean {
  return typeof window !== 'undefined' && sessionStorage.getItem(GOOGLE_REAUTH_KEY) === '1'
}

function markGoogleReauthRequired(): void {
  if (typeof window !== 'undefined') sessionStorage.setItem(GOOGLE_REAUTH_KEY, '1')
}

function clearGoogleReauthFlags(): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(GOOGLE_REAUTH_KEY)
  sessionStorage.removeItem(GOOGLE_OAUTH_RETRY_KEY)
}

function isAlreadyLinkedOAuthError(description: string): boolean {
  return description.toLowerCase().includes('already linked')
}

export function isOAuthCallbackUrl(): boolean {
  if (typeof window === 'undefined') return false
  const search = window.location.search
  return search.includes('code=') || search.includes('error=')
}

let oauthExchangePromise: Promise<Session | null> | null = null

async function waitForGoogleSession(
  sb: NonNullable<ReturnType<typeof getSupabase>>,
  timeoutMs = 8000
): Promise<Session | null> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (session: Session | null) => {
      if (settled) return
      settled = true
      sub.subscription.unsubscribe()
      clearTimeout(timer)
      resolve(session)
    }

    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      if (isFullGoogleSession(session)) finish(session)
    })

    sb.auth.getSession().then(({ data }) => {
      if (isFullGoogleSession(data.session)) finish(data.session)
    })

    const timer = setTimeout(() => finish(null), timeoutMs)
  })
}

async function signInWithGoogleOAuthOnly(
  sb: NonNullable<ReturnType<typeof getSupabase>>,
  redirectTo: string | undefined,
  oauthOpts?: ReturnType<typeof getGoogleOAuthOptions>
): Promise<void> {
  const { data } = await sb.auth.getSession()
  if (data.session?.user?.is_anonymous) {
    await sb.auth.signOut({ scope: 'local' })
  }

  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: oauthOpts ?? getGoogleOAuthOptions(redirectTo),
  })
  if (error) console.error('[google-auth] signInWithOAuth failed', error.message)
}

export interface SignInWithGoogleOptions {
  /** Re-request Drive scope when token expired (no_token). */
  forceConsent?: boolean
}

/**
 * Unified Google sign-in: Supabase Auth (marketplace) + Drive token (sync).
 * Drive scope는 signInWithOAuth / linkIdentity options.scopes 로 요청합니다.
 * (Supabase 대시보드 Additional scopes UI는 없어도 됨)
 */
export async function signInWithGoogleUnified(opts?: SignInWithGoogleOptions): Promise<void> {
  const sb = getSupabase()
  if (!sb) {
    console.error('[google-auth] Supabase not configured')
    return
  }

  const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined

  if (opts?.forceConsent) {
    await signInWithGoogleOAuthOnly(
      sb,
      redirectTo,
      getGoogleOAuthOptions(redirectTo, { forceConsent: true })
    )
    return
  }

  const { data } = await sb.auth.getSession()
  const isAnon = Boolean(data.session?.user?.is_anonymous)
  const reauth = shouldUseOAuthSignIn()
  const firstConnect = !hasEverConnectedGoogle()
  const oauthOptions = getGoogleOAuthOptions(redirectTo, {
    firstConnect: !reauth && firstConnect,
  })

  if (isAnon && !reauth) {
    const { error } = await sb.auth.linkIdentity({
      provider: 'google',
      options: oauthOptions,
    })
    if (!error) return
    if (isAlreadyLinkedOAuthError(error.message)) {
      markGoogleReauthRequired()
    }
    console.warn('[google-auth] linkIdentity failed, using OAuth', error.message)
  }

  await signInWithGoogleOAuthOnly(
    sb,
    redirectTo,
    getGoogleOAuthOptions(redirectTo, { firstConnect: false })
  )
}

function cleanOAuthParamsFromUrl(): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.delete('code')
  url.searchParams.delete('error')
  url.searchParams.delete('error_description')
  url.searchParams.delete('error_code')
  const qs = url.searchParams.toString()
  const next = url.pathname + (qs ? `?${qs}` : '') + url.hash
  window.history.replaceState(null, '', next)
}

function isFullGoogleSession(session: Session | null | undefined): session is Session {
  return Boolean(session?.user && !session.user.is_anonymous)
}

/**
 * Complete PKCE OAuth callback when the redirect URL contains ?code= or ?error=.
 * Returns the Google-linked session, or null if no callback / exchange failed.
 */
async function completeSupabaseOAuthCallback(): Promise<Session | null> {
  if (!isSupabaseConfigured() || typeof window === 'undefined') return null
  const sb = getSupabase()
  if (!sb) return null

  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const oauthError = params.get('error')

  if (oauthError) {
    const description = params.get('error_description') ?? ''
    cleanOAuthParamsFromUrl()

    if (isAlreadyLinkedOAuthError(description)) {
      markGoogleReauthRequired()
      const alreadyRetried = sessionStorage.getItem(GOOGLE_OAUTH_RETRY_KEY) === '1'
      if (!alreadyRetried) {
        sessionStorage.setItem(GOOGLE_OAUTH_RETRY_KEY, '1')
        await signInWithGoogleOAuthOnly(
          sb,
          window.location.origin,
          getGoogleOAuthOptions(window.location.origin, { firstConnect: false })
        )
        return null
      }
      sessionStorage.removeItem(GOOGLE_OAUTH_RETRY_KEY)
    }

    console.error('[google-auth] OAuth error:', oauthError, description)
    return null
  }

  if (!code) {
    const { data } = await sb.auth.getSession()
    return isFullGoogleSession(data.session) ? data.session : null
  }

  const { data: existing } = await sb.auth.getSession()
  if (isFullGoogleSession(existing.session)) {
    cleanOAuthParamsFromUrl()
    return existing.session
  }

  const { data, error } = await sb.auth.exchangeCodeForSession(code)
  cleanOAuthParamsFromUrl()

  if (error) {
    const verifierMissing = error.message.toLowerCase().includes('code verifier')
    if (verifierMissing) {
      const existing = await waitForGoogleSession(sb, 3000)
      if (isFullGoogleSession(existing)) return existing
    }
    console.error('[google-auth] code exchange failed:', error.message)
    return null
  }

  let session = data.session
  if (isFullGoogleSession(session) && !session.provider_token) {
    const { data: refreshed } = await sb.auth.refreshSession()
    if (isFullGoogleSession(refreshed.session)) {
      session = refreshed.session
    }
  }

  return isFullGoogleSession(session) ? session : null
}

export async function completeSupabaseOAuthIfNeeded(): Promise<Session | null> {
  if (!isOAuthCallbackUrl()) {
    const sb = getSupabase()
    if (!sb) return null
    const { data } = await sb.auth.getSession()
    return isFullGoogleSession(data.session) ? data.session : null
  }

  if (!oauthExchangePromise) {
    oauthExchangePromise = completeSupabaseOAuthCallback().finally(() => {
      oauthExchangePromise = null
    })
  }
  return oauthExchangePromise
}

/** Sign out from Supabase and clear local Drive sync credentials. */
export async function signOutGoogleUnified(): Promise<void> {
  markGoogleReauthRequired()
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(GOOGLE_REAUTH_SESSION_KEY, '1')
  }
  const sb = getSupabase()
  if (sb) {
    await sb.auth.signOut()
    await ensureAnonymousSession()
  }
  await clearGoogleAuth()
}

/**
 * Copy Google provider token from Supabase session into Dexie syncMeta
 * so existing lib/sync.ts Drive API calls keep working.
 */
export async function syncDriveTokenFromSupabaseSession(session: Session | null): Promise<void> {
  if (!session?.user || session.user.is_anonymous) return

  const email = session.user.email ?? null
  const providerToken = session.provider_token
  const prevMeta = await getSyncMeta()

  if (providerToken) {
    const expiresIn = session.expires_in ?? 3600
    const isFirstConnect = !hasEverConnectedGoogle()
    await updateSyncMeta({
      googleEmail: email,
      googleAccessToken: providerToken,
      googleTokenExpiry: Date.now() + expiresIn * 1000,
    })
    markEverConnectedGoogle()
    clearGoogleReauthFlags()
    if (typeof window !== 'undefined' && isFirstConnect) {
      window.sessionStorage.setItem(GOOGLE_JUST_CONNECTED_KEY, '1')
    }
  } else if (isGoogleTokenValid(prevMeta)) {
    await updateSyncMeta({ googleEmail: email })
    clearGoogleReauthFlags()
  } else {
    console.warn('[google-auth] No provider_token in session — Drive 동기화는 불가하지만 프로필은 동기화합니다.')
    await updateSyncMeta({ googleEmail: email })
    clearGoogleReauthFlags()
  }

  await ensureProfile(session.user)
  await syncLocalProfileFromGoogleUser(session.user, session)
}

/** On app init: sync Drive token if Supabase session already exists. */
export async function initGoogleFromSupabaseSession(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false

  const session = await completeSupabaseOAuthIfNeeded()

  if (isFullGoogleSession(session)) {
    await syncDriveTokenFromSupabaseSession(session)
    return true
  }
  return false
}
