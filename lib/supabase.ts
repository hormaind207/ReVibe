'use client'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

/** True only when both env vars are present — marketplace can run. */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
}

let client: SupabaseClient | null = null

/**
 * Singleton Supabase client. Returns null when env vars are missing so the
 * rest of the app keeps working (marketplace tab shows a setup notice instead).
 */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // OAuth callback is handled explicitly in lib/google-auth.ts to avoid
        // double PKCE exchange races with other getSupabase() callers.
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    })
  }
  return client
}

export const STORAGE_BUCKET = 'template-images'
export const MAX_TEMPLATE_CARDS = 1000
export const REPORT_HIDE_THRESHOLD = 3
