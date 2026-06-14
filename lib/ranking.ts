'use client'

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'

export interface LeaderboardEntry {
  rank: number
  userId: string
  nickname: string
  trophyCount: number
  score: number
  avatarUrl?: string
  avatarEmoji: string
  isSelf?: boolean
}

export interface MyRank {
  rank: number | null
  score: number
  eligible: boolean
  rankingBlocked: boolean
  rankingOptedOut: boolean
}

export interface FriendRequest {
  id: string
  requesterId: string
  nickname: string
  trophyCount: number
  createdAt: string
}

export interface ProfileSearchResult {
  userId: string
  nickname: string
  trophyCount: number
  avatarUrl?: string
  avatarEmoji: string
}

const LEAGUE_SCORE_ERROR_KEY = 'league_score_error'

/** 점수 적립 실패 메시지를 꺼냅니다 (1회성). */
export function consumeLeagueScoreError(): string | null {
  if (typeof window === 'undefined') return null
  const msg = sessionStorage.getItem(LEAGUE_SCORE_ERROR_KEY)
  if (msg) sessionStorage.removeItem(LEAGUE_SCORE_ERROR_KEY)
  return msg
}

export type AddLeagueScoreResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; error: string }

/** 현재 주 점수 적립. 비구글 사용자·Supabase 미설정 시 no-op. */
export async function addLeagueScore(delta: number, reason?: string): Promise<AddLeagueScoreResult> {
  if (!isSupabaseConfigured() || delta <= 0) return { ok: true, skipped: true }
  const sb = getSupabase()
  if (!sb) return { ok: true, skipped: true }
  const { data: { user } } = await sb.auth.getUser()
  if (!user || user.is_anonymous) return { ok: true, skipped: true }

  const { error } = await sb.rpc('add_league_score', { delta, reason: reason ?? null })
  if (error) {
    const message = '점수 적립에 실패했습니다. 네트워크 연결을 확인해 주세요.'
    if (typeof window !== 'undefined') sessionStorage.setItem(LEAGUE_SCORE_ERROR_KEY, message)
    return { ok: false, error: message }
  }
  return { ok: true }
}

/** 주간 리더보드 상위 N명 조회 (score ≥ 5인 사용자만) */
export async function getWeeklyLeaderboard(limitN = 10): Promise<LeaderboardEntry[]> {
  const sb = getSupabase()
  if (!sb) return []
  const { data, error } = await sb.rpc('get_weekly_leaderboard', { limit_n: limitN })
  if (error || !data) return []
  return (data as { rank: number; user_id: string; nickname: string; trophy_count: number; score: number; avatar_url?: string; avatar_emoji?: string }[]).map(r => ({
    rank: Number(r.rank),
    userId: r.user_id,
    nickname: r.nickname,
    trophyCount: r.trophy_count,
    score: r.score,
    avatarUrl: r.avatar_url ?? undefined,
    avatarEmoji: r.avatar_emoji ?? '🧠',
  }))
}

/** 내 순위와 점수 조회 (5점 미만이면 rank=null, eligible=false) */
export async function getMyWeeklyRank(): Promise<MyRank | null> {
  const sb = getSupabase()
  if (!sb) return null
  const { data, error } = await sb.rpc('get_my_weekly_rank')
  if (error || !data || (data as unknown[]).length === 0) return null
  const row = (data as {
    rank: number | null
    score: number
    eligible?: boolean
    ranking_blocked?: boolean
    ranking_opted_out?: boolean
  }[])[0]
  return {
    rank: row.rank != null ? Number(row.rank) : null,
    score: row.score,
    eligible: row.eligible ?? row.score >= 5,
    rankingBlocked: row.ranking_blocked ?? false,
    rankingOptedOut: row.ranking_opted_out ?? false,
  }
}

/** 랭킹 참여 여부 (기본 true) */
export async function getRankingOptIn(userId: string): Promise<boolean> {
  const sb = getSupabase()
  if (!sb) return true
  const { data } = await sb.from('profiles').select('ranking_opt_in').eq('id', userId).maybeSingle()
  return (data as { ranking_opt_in?: boolean } | null)?.ranking_opt_in ?? true
}

/** 랭킹 참여 on/off */
export async function setRankingOptIn(userId: string, optIn: boolean): Promise<boolean> {
  const sb = getSupabase()
  if (!sb) return false
  const { error } = await sb.from('profiles').update({ ranking_opt_in: optIn }).eq('id', userId)
  return !error
}

/** 닉네임으로 사용자 검색 (친구 추가용) */
export async function searchProfiles(q: string): Promise<ProfileSearchResult[]> {
  const sb = getSupabase()
  if (!sb || !q.trim()) return []
  const { data, error } = await sb.rpc('search_profiles', { q: q.trim() })
  if (error || !data) return []
  return (data as { user_id: string; nickname: string; trophy_count: number; avatar_url?: string; avatar_emoji?: string }[]).map(r => ({
    userId: r.user_id,
    nickname: r.nickname,
    trophyCount: r.trophy_count,
    avatarUrl: r.avatar_url ?? undefined,
    avatarEmoji: r.avatar_emoji ?? '🧠',
  }))
}

/** 친구 요청 보내기 */
export async function sendFriendRequest(toUid: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) return
  await sb.rpc('send_friend_request', { to_uid: toUid })
}

/** 친구 요청 수락/거절 */
export async function respondFriendRequest(fid: string, accept: boolean): Promise<void> {
  const sb = getSupabase()
  if (!sb) return
  await sb.rpc('respond_friend_request', { fid, accept })
}

/** 내가 받은 친구 요청 목록 */
export async function getPendingRequests(): Promise<FriendRequest[]> {
  const sb = getSupabase()
  if (!sb) return []
  const { data, error } = await sb.rpc('get_pending_requests')
  if (error || !data) return []
  return (data as { id: string; requester_id: string; nickname: string; trophy_count: number; created_at: string }[]).map(r => ({
    id: r.id,
    requesterId: r.requester_id,
    nickname: r.nickname,
    trophyCount: r.trophy_count,
    createdAt: r.created_at,
  }))
}

/** 친구 + 본인 리더보드 */
export async function getFriendLeaderboard(): Promise<LeaderboardEntry[]> {
  const sb = getSupabase()
  if (!sb) return []
  const { data, error } = await sb.rpc('get_friend_leaderboard')
  if (error || !data) return []
  return (data as { rank: number; user_id: string; nickname: string; trophy_count: number; score: number; is_self: boolean; avatar_url?: string; avatar_emoji?: string }[]).map(r => ({
    rank: Number(r.rank),
    userId: r.user_id,
    nickname: r.nickname,
    trophyCount: r.trophy_count,
    score: r.score,
    isSelf: r.is_self,
    avatarUrl: r.avatar_url ?? undefined,
    avatarEmoji: r.avatar_emoji ?? '🧠',
  }))
}

/** profiles에서 trophy_count 조회 */
export async function getProfileTrophyCount(userId: string): Promise<number> {
  const sb = getSupabase()
  if (!sb) return 0
  const { data } = await sb.from('profiles').select('trophy_count').eq('id', userId).single()
  return (data as { trophy_count?: number } | null)?.trophy_count ?? 0
}

export interface LeagueNotification {
  id: string
  kind: string
  weekStart: string
  message: string
  createdAt: string
}

/** 미읽음 리그 알림 (트로피 무효 등) */
export async function getUnreadLeagueNotifications(): Promise<LeagueNotification[]> {
  const sb = getSupabase()
  if (!sb) return []
  const { data, error } = await sb.rpc('get_unread_league_notifications')
  if (error || !data) return []
  return (data as { id: string; kind: string; week_start: string; message: string; created_at: string }[]).map(r => ({
    id: r.id,
    kind: r.kind,
    weekStart: r.week_start,
    message: r.message,
    createdAt: r.created_at,
  }))
}

/** 리그 알림 읽음 처리 */
export async function markLeagueNotificationRead(notificationId: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) return
  await sb.rpc('mark_league_notification_read', { notification_id: notificationId })
}

/** 현재 로그인 유저의 이번 주 내 마켓플레이스 좋아요 총합 */
export async function getMyTotalLikes(userId: string): Promise<number> {
  const sb = getSupabase()
  if (!sb || !userId) return 0
  const { data } = await sb
    .from('templates')
    .select('like_count')
    .eq('owner_id', userId)
    .eq('hidden', false)
  if (!data) return 0
  return (data as { like_count: number }[]).reduce((sum, t) => sum + (t.like_count ?? 0), 0)
}
