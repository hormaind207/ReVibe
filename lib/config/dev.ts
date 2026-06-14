/** Session-only dev key (set after Supabase validate_dev_key RPC). Never in env/bundle. */
const DEV_KEY_SESSION = 'revibe_dev_key_session'

export function getDevSessionKey(): string {
  if (typeof window === 'undefined') return ''
  return sessionStorage.getItem(DEV_KEY_SESSION)?.trim() ?? ''
}

export function setDevSessionKey(key: string): void {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(DEV_KEY_SESSION, key.trim())
}

export function clearDevSessionKey(): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(DEV_KEY_SESSION)
}

/** @deprecated use getDevSessionKey — kept for call sites */
export function getDevModeKey(): string {
  return getDevSessionKey()
}
