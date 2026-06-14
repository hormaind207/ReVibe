'use client'

import { getSupabase } from '@/lib/supabase'
import { getDevSessionKey } from '@/lib/config/dev'

export interface RankingBlockedUser {
  userId: string
  nickname: string
  blockedAt: string
}

export interface AdminProfileSearchResult {
  userId: string
  nickname: string
  trophyCount: number
  rankingHidden: boolean
}

export async function listRankingBlockedUsers(
  devKey: string = getDevSessionKey()
): Promise<RankingBlockedUser[]> {
  const sb = getSupabase()
  if (!sb || !devKey) return []
  const { data, error } = await sb.rpc('admin_list_ranking_blocked_users', { p_dev_key: devKey })
  if (error) {
    console.error('[ranking-moderation] list failed', error.message)
    return []
  }
  return ((data ?? []) as { user_id: string; nickname: string; blocked_at: string }[]).map((r) => ({
    userId: r.user_id,
    nickname: r.nickname,
    blockedAt: r.blocked_at,
  }))
}

export async function adminSearchProfiles(
  q: string,
  devKey: string = getDevSessionKey()
): Promise<AdminProfileSearchResult[]> {
  const sb = getSupabase()
  if (!sb || !devKey || !q.trim()) return []
  const { data, error } = await sb.rpc('admin_search_profiles', { p_dev_key: devKey, q: q.trim() })
  if (error) {
    console.error('[ranking-moderation] search failed', error.message)
    return []
  }
  return ((data ?? []) as { user_id: string; nickname: string; trophy_count: number; ranking_hidden: boolean }[]).map((r) => ({
    userId: r.user_id,
    nickname: r.nickname,
    trophyCount: r.trophy_count,
    rankingHidden: r.ranking_hidden,
  }))
}

export async function hideRankingUser(
  userId: string,
  devKey: string = getDevSessionKey()
): Promise<boolean> {
  const sb = getSupabase()
  if (!sb || !devKey) return false
  const { error } = await sb.rpc('admin_hide_ranking_user', { p_dev_key: devKey, p_user_id: userId })
  if (error) {
    console.error('[ranking-moderation] hide failed', error.message)
    return false
  }
  return true
}

export async function unhideRankingUser(
  userId: string,
  devKey: string = getDevSessionKey()
): Promise<boolean> {
  const sb = getSupabase()
  if (!sb || !devKey) return false
  const { error } = await sb.rpc('admin_unhide_ranking_user', { p_dev_key: devKey, p_user_id: userId })
  if (error) {
    console.error('[ranking-moderation] unhide failed', error.message)
    return false
  }
  return true
}
