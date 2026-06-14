'use client'

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { getDevSessionKey, setDevSessionKey, clearDevSessionKey } from '@/lib/config/dev'

const STORAGE_KEY = 'revibe_developer_mode'

function readEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(STORAGE_KEY) === '1' && getDevSessionKey().length > 0
}

/** Stale flag: localStorage on but session key missing (e.g. new tab) */
function hasStaleDevFlag(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(STORAGE_KEY) === '1' && getDevSessionKey().length === 0
}

export function useDeveloperMode() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    if (hasStaleDevFlag()) {
      localStorage.removeItem(STORAGE_KEY)
    }
    setEnabled(readEnabled())

    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setEnabled(readEnabled())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const enable = useCallback(async (password: string): Promise<boolean> => {
    const sb = getSupabase()
    if (!sb || !password.trim()) return false
    const { data, error } = await sb.rpc('validate_dev_key', { p_dev_key: password.trim() })
    if (error || !data) return false
    setDevSessionKey(password.trim())
    localStorage.setItem(STORAGE_KEY, '1')
    setEnabled(true)
    return true
  }, [])

  const disable = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    clearDevSessionKey()
    setEnabled(false)
  }, [])

  return { enabled, enable, disable }
}

/** Non-hook read for one-off checks (e.g. RPC calls). */
export function isDeveloperModeEnabled(): boolean {
  return readEnabled()
}
