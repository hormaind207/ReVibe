/**
 * Handles Google OAuth implicit flow redirect callback.
 *
 * After redirect, the URL hash contains:
 *   #access_token=TOKEN&token_type=bearer&expires_in=3600&scope=...
 *
 * We parse this, fetch user info, store the token, and clean the URL.
 * Returns true if a callback was detected and processed.
 */

import { updateSyncMeta } from './hooks/use-sync-meta'

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
    const userInfo: { email: string } = await res.json()

    await updateSyncMeta({
      googleEmail: userInfo.email,
      googleAccessToken: accessToken,
      googleTokenExpiry: Date.now() + (Number(expiresIn) || 3600) * 1000,
    })

    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('google_just_connected', '1')
    }
    return true
  } catch (err) {
    console.error('[OAuth] Failed to process callback:', err)
    return false
  }
}
