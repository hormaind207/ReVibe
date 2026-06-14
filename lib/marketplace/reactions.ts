'use client'

import { getSupabase } from '@/lib/supabase'

export type ToggleLikeResult =
  | { ok: true; liked: boolean }
  | { ok: false; reason: 'own_template' | 'error' }

/** Toggle like for the current user. Returns result with new liked state or failure reason. */
export async function toggleLike(
  templateId: string,
  uid: string,
  liked: boolean,
  ownerId?: string,
): Promise<ToggleLikeResult> {
  const sb = getSupabase()
  if (!sb) return { ok: false, reason: 'error' }

  if (ownerId && ownerId === uid && !liked) {
    return { ok: false, reason: 'own_template' }
  }

  if (liked) {
    const { error } = await sb.from('template_likes').delete().eq('template_id', templateId).eq('user_id', uid)
    if (error) return { ok: false, reason: 'error' }
    return { ok: true, liked: false }
  }

  const { error } = await sb.from('template_likes').insert({ template_id: templateId, user_id: uid })
  if (error) return { ok: false, reason: 'error' }
  return { ok: true, liked: true }
}

/** Toggle favorite for the current user. Returns the new favorited state
 *  (unchanged on failure so the UI doesn't show a state that didn't persist). */
export async function toggleFavorite(templateId: string, uid: string, favorited: boolean): Promise<boolean> {
  const sb = getSupabase()
  if (!sb) return favorited
  if (favorited) {
    const { error } = await sb.from('template_favorites').delete().eq('template_id', templateId).eq('user_id', uid)
    if (error) return favorited
    return false
  }
  const { error } = await sb.from('template_favorites').insert({ template_id: templateId, user_id: uid })
  if (error) return favorited
  return true
}

export type ReportResult = 'reported' | 'already' | 'error'

/** Report a template (one per user). Distinguishes new report vs already vs error. */
export async function reportTemplate(templateId: string, uid: string, reason?: string): Promise<ReportResult> {
  const sb = getSupabase()
  if (!sb) return 'error'
  const { error } = await sb
    .from('template_reports')
    .insert({ template_id: templateId, user_id: uid, reason: reason ?? null })
  if (!error) return 'reported'
  // 23505 = unique_violation → the user already reported this template.
  if ((error as { code?: string }).code === '23505') return 'already'
  return 'error'
}

/** Whether the current user already reported this template. */
export async function hasReported(templateId: string, uid: string): Promise<boolean> {
  const sb = getSupabase()
  if (!sb) return false
  const { data } = await sb
    .from('template_reports')
    .select('template_id')
    .eq('template_id', templateId)
    .eq('user_id', uid)
    .maybeSingle()
  return Boolean(data)
}
