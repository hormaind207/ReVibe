/**
 * Legacy Google OAuth implicit flow redirect callback.
 * Fallback when Supabase Auth is not configured — see lib/db-ready-context.tsx.
 *
 * After redirect, the URL hash contains:
 *   #access_token=TOKEN&token_type=bearer&expires_in=3600&scope=...
 *
 * We parse this, fetch user info, store the token, and clean the URL.
 * Returns true if a callback was detected and processed.
 */

import { updateSyncMeta } from './hooks/use-sync-meta'
import { updateUserProfile } from './hooks/use-user-profile'

/** Must match GOOGLE_JUST_CONNECTED_KEY in lib/google-auth.ts */
const GOOGLE_JUST_CONNECTED_KEY = 'google_just_connected'

export async function handleOAuthCallback(): Promise<boolean> {
  if (typeof window === 'undefined') return false

  const hash = window.location.hash
  // OAuth response hash starts with #access_token= (no leading slash)
  if (!hash || !hash.includes('access_token=')) return false

  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
  const accessToken = params.get('access_token')
  const expiresIn = params.get('expires_in')
  const error = params.get('error')

  // Clear the hash immediately so it won't be re-processed on next load
  window.history.replaceState(null, '', window.location.pathname)

  if (error || !accessToken) {
    console.error('[OAuth] Callback error:', error)
    return false
  }

  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return false
    const userInfo: { email: string; name?: string; picture?: string } = await res.json()

    await updateSyncMeta({
      googleEmail: userInfo.email,
      googleAccessToken: accessToken,
      googleTokenExpiry: Date.now() + (Number(expiresIn) || 3600) * 1000,
    })

    await updateUserProfile({
      nickname: userInfo.name || userInfo.email.split('@')[0] || '게스트',
      avatarImage: userInfo.picture,
    })

    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(GOOGLE_JUST_CONNECTED_KEY, '1')
    }
    return true
  } catch (err) {
    console.error('[OAuth] Failed to process callback:', err)
    return false
  }
}
