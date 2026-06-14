'use client'

import { getSupabase } from '@/lib/supabase'

/** Normalize a raw hashtag input: strip leading '#', trim, collapse spaces, lowercase. */
export function normalizeTag(raw: string): string {
  return raw
    .replace(/^#+/, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/** Display form with a leading '#'. */
export function displayTag(tag: string): string {
  return `#${tag}`
}

export interface HashtagCount {
  tag: string
  cnt: number
}

/** Suggestions for autocomplete: existing tags starting with the given prefix. */
export async function suggestHashtags(prefix: string): Promise<HashtagCount[]> {
  const sb = getSupabase()
  const clean = normalizeTag(prefix)
  if (!sb || !clean) return []
  const { data, error } = await sb.rpc('suggest_hashtags', { prefix: clean })
  if (error || !data) return []
  return (data as { tag: string; cnt: number }[]).map((d) => ({ tag: d.tag, cnt: Number(d.cnt) }))
}

/** Tags used by >= minCount templates — get their own section on the marketplace home. */
export async function getPopularHashtags(minCount = 3): Promise<HashtagCount[]> {
  const sb = getSupabase()
  if (!sb) return []
  const { data, error } = await sb.rpc('popular_hashtags', { min_count: minCount })
  if (error || !data) return []
  return (data as { tag: string; cnt: number }[]).map((d) => ({ tag: d.tag, cnt: Number(d.cnt) }))
}
