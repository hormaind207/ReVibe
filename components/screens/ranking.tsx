'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, Users, Search, UserPlus, Check, X, ChevronRight, Info, Loader2 } from 'lucide-react'
import { ScreenHeader } from '@/components/screen-header'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { GoogleSignInButton } from '@/components/google-sign-in-button'
import { useMarketplaceUser } from '@/lib/marketplace/auth'
import { getStreakMeta } from '@/lib/streak'
import { useExtendedLocalStats } from '@/lib/hooks/use-local-stats'
import { getMyTotalLikes, getProfileTrophyCount, getWeeklyLeaderboard, getMyWeeklyRank, getFriendLeaderboard, getPendingRequests, searchProfiles, sendFriendRequest, respondFriendRequest } from '@/lib/ranking'
import type { LeaderboardEntry, FriendRequest, ProfileSearchResult, MyRank } from '@/lib/ranking'
import { playButtonTap } from '@/lib/sounds'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useNavigation } from '@/lib/store'
import { useDeveloperMode } from '@/lib/hooks/use-developer-mode'
import { useUserProfile } from '@/lib/hooks/use-user-profile'
import { resolveProfileAvatarUrl } from '@/lib/google-auth'

type Tab = 'global' | 'friends'

const RANKING_CACHE_TTL_MS = 60_000

type GlobalRankingCache = {
  fetchedAt: number
  userId: string | null
  entries: LeaderboardEntry[]
  top50Entries: LeaderboardEntry[]
  myRank: MyRank | null
}

function getValidTop50RankingCache(): LeaderboardEntry[] | null {
  if (top50RankingCache && Date.now() - top50RankingCache.fetchedAt < RANKING_CACHE_TTL_MS) {
    return top50RankingCache.entries
  }
  const global = globalRankingCache
  if (global && Date.now() - global.fetchedAt < RANKING_CACHE_TTL_MS && global.top50Entries.length > 0) {
    return global.top50Entries
  }
  return null
}

type FriendRankingCache = {
  fetchedAt: number
  entries: LeaderboardEntry[]
  pendingReqs: FriendRequest[]
}

let globalRankingCache: GlobalRankingCache | null = null
let friendRankingCache: FriendRankingCache | null = null
let top50RankingCache: { fetchedAt: number; entries: LeaderboardEntry[] } | null = null

function getValidGlobalRankingCache(userId: string | null): GlobalRankingCache | null {
  if (!globalRankingCache || globalRankingCache.userId !== userId) return null
  if (Date.now() - globalRankingCache.fetchedAt > RANKING_CACHE_TTL_MS) return null
  return globalRankingCache
}

function getValidFriendRankingCache(): FriendRankingCache | null {
  if (!friendRankingCache) return null
  if (Date.now() - friendRankingCache.fetchedAt > RANKING_CACHE_TTL_MS) return null
  return friendRankingCache
}

// Dedupe friend requests across all entry points so rapid taps don't send twice.
const pendingFriendRequests = new Set<string>()
async function sendFriendRequestOnce(uid: string): Promise<boolean> {
  if (pendingFriendRequests.has(uid)) return false
  pendingFriendRequests.add(uid)
  try {
    await sendFriendRequest(uid)
    return true
  } finally {
    pendingFriendRequests.delete(uid)
  }
}

const pendingFriendResponses = new Set<string>()
async function respondFriendRequestOnce(fid: string, accept: boolean): Promise<boolean> {
  if (pendingFriendResponses.has(fid)) return false
  pendingFriendResponses.add(fid)
  try {
    await respondFriendRequest(fid, accept)
    return true
  } finally {
    pendingFriendResponses.delete(fid)
  }
}

// ─── 통계 섹션 ─────────────────────────────────────────────────────────────
function StatsSection({ userId }: { userId: string | null }) {
  const { totalCards, totalCategories, totalStacks, todayCount, graduatedCards } = useExtendedLocalStats()

  const [longestStreak, setLongestStreak] = useState(0)
  const [totalLikes, setTotalLikes] = useState(0)
  const [trophyCount, setTrophyCount] = useState(0)

  useEffect(() => {
    getStreakMeta().then(m => setLongestStreak(m.longestStreak))
  }, [])

  useEffect(() => {
    if (userId) {
      getMyTotalLikes(userId).then(setTotalLikes)
      getProfileTrophyCount(userId).then(setTrophyCount)
    }
  }, [userId])

  const items = [
    { label: '전체 카드', value: totalCards, color: 'text-primary' },
    { label: '카테고리', value: totalCategories, color: 'text-primary' },
    { label: '오늘 복습', value: todayCount, color: 'text-[#e89b73]' },
    { label: '전체 스택', value: totalStacks, color: 'text-primary' },
    { label: '졸업 카드', value: graduatedCards, color: 'text-amber-600' },
    { label: '최장 스트릭', value: `${longestStreak}일`, color: 'text-orange-500' },
    { label: '마켓 좋아요', value: totalLikes, color: 'text-red-500' },
    { label: '트로피', value: trophyCount, color: 'text-amber-500' },
  ]

  return (
    <div className="px-4 pt-4 pb-2">
      <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">내 통계</p>
      <div className="grid grid-cols-4 gap-1.5">
        {items.map(({ label, value, color }) => (
          <div key={label} className="flex flex-col items-center rounded-xl bg-card px-1 py-2.5 shadow-sm">
            <span className={`text-lg font-extrabold ${color}`}>{value}</span>
            <span className="mt-0.5 text-center text-[10px] leading-tight text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── 트로피 뱃지 ─────────────────────────────────────────────────────────────
function TrophyBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-600">
      🏆{count}
    </span>
  )
}

function RankAvatar({
  nickname,
  avatarUrl,
  avatarEmoji,
}: {
  nickname: string
  avatarUrl?: string
  avatarEmoji: string
}) {
  return (
    <Avatar className="h-9 w-9 shrink-0">
      {avatarUrl ? <AvatarImage src={avatarUrl} alt={nickname} /> : null}
      <AvatarFallback className="text-base">{avatarEmoji || nickname.charAt(0)}</AvatarFallback>
    </Avatar>
  )
}

// ─── 리더보드 행 ─────────────────────────────────────────────────────────────
function LeaderRow({
  entry,
  showFriendBtn,
  onFriendRequest,
}: {
  entry: LeaderboardEntry
  showFriendBtn?: boolean
  onFriendRequest?: (uid: string, nickname: string) => void
}) {
  const rankColor =
    entry.rank === 1 ? 'text-amber-500' :
    entry.rank === 2 ? 'text-slate-400' :
    entry.rank === 3 ? 'text-amber-700' :
    'text-muted-foreground'

  const rankIcon =
    entry.rank === 1 ? '🥇' :
    entry.rank === 2 ? '🥈' :
    entry.rank === 3 ? '🥉' :
    `${entry.rank}`

  return (
    <div className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${entry.isSelf ? 'bg-primary/10 ring-1 ring-primary/30' : 'bg-card'} shadow-sm`}>
      <span className={`w-7 shrink-0 text-center text-sm font-bold ${rankColor}`}>{rankIcon}</span>
      <RankAvatar nickname={entry.nickname} avatarUrl={entry.avatarUrl} avatarEmoji={entry.avatarEmoji} />
      <div className="flex-1 min-w-0">
        <p className="flex items-center text-sm font-semibold text-foreground truncate">
          {entry.nickname}
          <TrophyBadge count={entry.trophyCount} />
          {entry.isSelf && <span className="ml-1.5 text-[10px] font-bold text-primary">나</span>}
        </p>
      </div>
      <span className="text-sm font-bold text-primary">{entry.score}점</span>
      {showFriendBtn && !entry.isSelf && onFriendRequest && (
        <button
          onClick={() => { playButtonTap(); onFriendRequest(entry.userId, entry.nickname) }}
          className="ml-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
          aria-label="친구 추가"
        >
          <UserPlus className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

// ─── 점수 안내 모달 ─────────────────────────────────────────────────────────
function ScoreInfoModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0" onClick={onClose}>
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        className="w-full max-w-md rounded-t-3xl bg-card p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-foreground">점수 시스템 안내</h3>
          <button onClick={onClose} className="text-muted-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex flex-col gap-3">
          {[
            { icon: '📇', label: '카드 복습 1장', score: '+1점' },
            { icon: '🔥', label: '스트릭 1회 증가', score: '+10점' },
            { icon: '❤️', label: '내 템플릿 좋아요 1개 증가', score: '+5점' },
            { icon: '🎓', label: '카드 졸업 1장', score: '+2점' },
          ].map(({ icon, label, score }) => (
            <div key={label} className="flex items-center gap-3 rounded-xl bg-muted px-4 py-3">
              <span className="text-xl">{icon}</span>
              <span className="flex-1 text-sm font-medium text-foreground">{label}</span>
              <span className="text-sm font-bold text-primary">{score}</span>
            </div>
          ))}
          <p className="mt-1 rounded-xl bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
            주간 리그는 매주 일요일 자정에 초기화됩니다.<br />
            이번 주 1위는 트로피 🏆를 획득합니다. 점수 5점 이상만 랭킹에 진입합니다.
          </p>
        </div>
      </motion.div>
    </div>
  )
}

// ─── Top 50 모달 ─────────────────────────────────────────────────────────────
function Top50Modal({
  onClose,
  onFriendRequest,
  isGoogleUser,
  cachedTop10,
}: {
  onClose: () => void
  onFriendRequest: (uid: string, name: string) => void
  isGoogleUser: boolean
  cachedTop10?: LeaderboardEntry[]
}) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>(cachedTop10 ?? [])
  const [loading, setLoading] = useState(!(cachedTop10 && cachedTop10.length > 0))

  useEffect(() => {
    let active = true
    const cachedFull = getValidTop50RankingCache()
    if (cachedFull) {
      setEntries(cachedFull)
      setLoading(false)
      return
    }
    if (cachedTop10?.length) {
      setEntries(cachedTop10)
      setLoading(false)
    }
    getWeeklyLeaderboard(50).then((data) => {
      if (!active) return
      top50RankingCache = { fetchedAt: Date.now(), entries: data }
      if (globalRankingCache) {
        globalRankingCache = {
          ...globalRankingCache,
          top50Entries: data,
        }
      }
      setEntries(data)
      setLoading(false)
    })
    return () => { active = false }
  }, [cachedTop10])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background" >
      <div className="flex items-center gap-3 border-b border-border px-4 py-4">
        <button onClick={onClose} className="text-muted-foreground"><X className="h-5 w-5" /></button>
        <h2 className="text-base font-bold text-foreground">TOP 50 전체 랭킹</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> 불러오는 중...
          </div>
        ) : entries.length === 0 ? (
          <p className="py-20 text-center text-sm text-muted-foreground">랭킹 데이터가 없습니다.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {entries.map(e => (
              <LeaderRow key={e.userId} entry={e} showFriendBtn={isGoogleUser} onFriendRequest={onFriendRequest} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 친구 추가 검색 모달 ─────────────────────────────────────────────────────
function FriendSearchModal({ onClose, onSent }: { onClose: () => void; onSent: (nickname: string) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProfileSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState<Set<string>>(new Set())
  const searchSeqRef = useRef(0)

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return
    const seq = ++searchSeqRef.current
    setLoading(true)
    const data = await searchProfiles(query)
    if (seq !== searchSeqRef.current) return
    setResults(data)
    setLoading(false)
  }, [query])

  const handleSend = async (uid: string, nickname: string) => {
    if (sent.has(uid)) return
    playButtonTap()
    const ok = await sendFriendRequestOnce(uid)
    if (!ok) return
    setSent(prev => new Set(prev).add(uid))
    onSent(nickname)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        className="w-full max-w-md rounded-t-3xl bg-card p-6 pb-10 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-foreground">친구 추가</h3>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>
        <div className="flex gap-2 mb-4">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="닉네임 검색..."
            className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            autoFocus
          />
          <button
            onClick={handleSearch}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
        {loading && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
        {!loading && results.length === 0 && query && (
          <p className="py-4 text-center text-sm text-muted-foreground">검색 결과가 없습니다.</p>
        )}
        <div className="flex flex-col gap-2">
          {results.map(r => (
            <div key={r.userId} className="flex items-center gap-3 rounded-xl bg-muted px-4 py-3">
              <RankAvatar nickname={r.nickname} avatarUrl={r.avatarUrl} avatarEmoji={r.avatarEmoji} />
              <div className="flex-1 min-w-0">
                <p className="flex items-center text-sm font-semibold truncate">
                  {r.nickname}<TrophyBadge count={r.trophyCount} />
                </p>
              </div>
              <button
                onClick={() => handleSend(r.userId, r.nickname)}
                disabled={sent.has(r.userId)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${sent.has(r.userId) ? 'bg-muted text-muted-foreground' : 'bg-primary/15 text-primary'}`}
              >
                {sent.has(r.userId) ? <><Check className="h-3.5 w-3.5" />요청됨</> : <><UserPlus className="h-3.5 w-3.5" />추가</>}
              </button>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}

// ─── 전체 랭킹 탭 ─────────────────────────────────────────────────────────────
function GlobalRankingTab({ isGoogleUser, userId }: { isGoogleUser: boolean; userId: string | null }) {
  const { user: marketplaceUser } = useMarketplaceUser()
  const userProfile = useUserProfile()
  const selfAvatarUrl = resolveProfileAvatarUrl(userProfile.avatarImage, marketplaceUser)
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [myRank, setMyRank] = useState<MyRank | null>(null)
  const [loading, setLoading] = useState(true)
  const [showScoreInfo, setShowScoreInfo] = useState(false)
  const [showTop50, setShowTop50] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500) }

  const load = useCallback(async () => {
    const cached = getValidGlobalRankingCache(userId)
    if (cached) {
      setEntries(cached.entries)
      setMyRank(cached.myRank)
      setLoading(false)
      return
    }
    setLoading(true)
    const [lb50, mr] = await Promise.all([
      getWeeklyLeaderboard(50),
      isGoogleUser ? getMyWeeklyRank() : Promise.resolve(null),
    ])
    const top50Entries = lb50.map((e) => ({ ...e, isSelf: e.userId === userId }))
    const nextEntries = top50Entries.slice(0, 10)
    top50RankingCache = { fetchedAt: Date.now(), entries: top50Entries }
    globalRankingCache = {
      fetchedAt: Date.now(),
      userId,
      entries: nextEntries,
      top50Entries,
      myRank: mr,
    }
    setEntries(nextEntries)
    setMyRank(mr)
    setLoading(false)
  }, [isGoogleUser, userId])

  useEffect(() => { load() }, [load])

  const inTop10 = Boolean(myRank?.eligible && myRank.rank != null && myRank.rank <= 10)

  const handleFriendRequest = async (uid: string, nickname: string) => {
    const ok = await sendFriendRequestOnce(uid)
    if (!ok) return
    showToast(`${nickname}님에게 친구 요청을 보냈습니다.`)
  }

  return (
    <div className="flex flex-col gap-3 px-4 pb-6">
      {isGoogleUser && myRank?.rankingOptedOut && (
        <div className="rounded-2xl border border-border bg-muted/50 p-4">
          <p className="text-sm font-semibold text-foreground">랭킹 참여를 꺼 두었습니다</p>
          <p className="mt-1 text-xs text-muted-foreground">
            전체 랭킹에 표시되지 않습니다. 프로필에서 「랭킹 참여」를 켜면 다시 참여할 수 있습니다.
          </p>
        </div>
      )}

      {isGoogleUser && myRank?.rankingBlocked && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4">
          <p className="text-sm font-semibold text-destructive">랭킹에서 차단되었습니다</p>
          <p className="mt-1 text-xs text-muted-foreground">
            전체 랭킹에 표시되지 않습니다. 문의가 필요하면 운영자에게 연락해 주세요.
          </p>
        </div>
      )}

      {!isGoogleUser && isSupabaseConfigured() && (
        <div className="rounded-2xl bg-primary/5 border border-primary/20 p-4">
          <p className="mb-2 text-sm font-semibold text-foreground">랭킹 참여는 Google 로그인이 필요합니다</p>
          <p className="mb-3 text-xs text-muted-foreground">로그인하면 점수를 적립하고 순위에 등재됩니다.</p>
          <GoogleSignInButton />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> 불러오는 중...
        </div>
      ) : entries.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">이번 주 랭킹 데이터가 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map(e => (
            <LeaderRow key={e.userId} entry={e} showFriendBtn={isGoogleUser} onFriendRequest={handleFriendRequest} />
          ))}
        </div>
      )}

      {/* 5점 미만 — 랭킹 미진입 안내 */}
      {isGoogleUser && myRank && !myRank.eligible && !myRank.rankingBlocked && !myRank.rankingOptedOut && (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
          <p className="text-sm font-semibold text-foreground">현재 {myRank.score}점</p>
          <p className="mt-1 text-xs text-muted-foreground">
            랭킹 진입까지 <span className="font-bold text-amber-600">{Math.max(0, 5 - myRank.score)}점</span> 더 필요합니다.
            (5점 이상부터 순위에 표시됩니다)
          </p>
        </div>
      )}

      {/* 10위 밖 내 순위 */}
      {isGoogleUser && myRank?.eligible && myRank.rank != null && !inTop10 && (
        <>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10px] text-muted-foreground">내 순위</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-primary/10 ring-1 ring-primary/30 px-3 py-2.5 shadow-sm">
            <span className="w-7 shrink-0 text-center text-sm font-bold text-muted-foreground">{myRank.rank}위</span>
            <RankAvatar nickname="나" avatarUrl={selfAvatarUrl} avatarEmoji={userProfile.avatarEmoji} />
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">나</p>
            </div>
            <span className="text-sm font-bold text-primary">{myRank.score}점</span>
          </div>
        </>
      )}

      {/* 액션 버튼 */}
      <div className="flex gap-2 mt-1">
        <button
          onClick={() => { playButtonTap(); setShowTop50(true) }}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-card py-3 text-sm font-semibold text-foreground shadow-sm"
        >
          <Trophy className="h-4 w-4 text-amber-500" /> TOP 50 보기
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
        <button
          onClick={() => { playButtonTap(); setShowScoreInfo(true) }}
          className="flex h-12 w-12 items-center justify-center rounded-xl bg-card shadow-sm text-muted-foreground"
          aria-label="점수 안내"
        >
          <Info className="h-5 w-5" />
        </button>
      </div>

      <AnimatePresence>
        {showScoreInfo && <ScoreInfoModal onClose={() => setShowScoreInfo(false)} />}
        {showTop50 && (
          <Top50Modal
            isGoogleUser={isGoogleUser}
            cachedTop10={entries}
            onClose={() => setShowTop50(false)}
            onFriendRequest={handleFriendRequest}
          />
        )}
      </AnimatePresence>

      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-24 left-4 right-4 z-50 mx-auto max-w-md rounded-2xl bg-foreground px-4 py-3 text-center text-sm font-semibold text-background shadow-lg"
        >
          {toast}
        </motion.div>
      )}
    </div>
  )
}

// ─── 친구 랭킹 탭 ─────────────────────────────────────────────────────────────
function FriendRankingTab({ isGoogleUser }: { isGoogleUser: boolean }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [pendingReqs, setPendingReqs] = useState<FriendRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [showSearch, setShowSearch] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500) }

  const load = useCallback(async () => {
    const cached = getValidFriendRankingCache()
    if (cached) {
      setEntries(cached.entries)
      setPendingReqs(cached.pendingReqs)
      setLoading(false)
      return
    }
    setLoading(true)
    const [lb, reqs] = await Promise.all([getFriendLeaderboard(), getPendingRequests()])
    friendRankingCache = { fetchedAt: Date.now(), entries: lb, pendingReqs: reqs }
    setEntries(lb)
    setPendingReqs(reqs)
    setLoading(false)
  }, [])

  useEffect(() => { if (isGoogleUser) load() }, [isGoogleUser, load])

  const handleRespond = async (fid: string, accept: boolean, nickname: string) => {
    playButtonTap()
    const ok = await respondFriendRequestOnce(fid, accept)
    if (!ok) return
    setPendingReqs(prev => prev.filter(r => r.id !== fid))
    showToast(accept ? `${nickname}님과 친구가 되었습니다!` : `${nickname}님의 요청을 거절했습니다.`)
    if (accept) load()
  }

  if (!isGoogleUser) {
    return (
      <div className="px-4 pb-6">
        <div className="rounded-2xl bg-primary/5 border border-primary/20 p-4">
          <p className="mb-2 text-sm font-semibold text-foreground">친구 랭킹은 Google 로그인이 필요합니다</p>
          <GoogleSignInButton />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 px-4 pb-6">
      {/* 친구 요청 배너 */}
      {pendingReqs.length > 0 && (
        <div className="rounded-2xl bg-card p-4 shadow-sm">
          <p className="mb-3 text-sm font-bold text-foreground">친구 요청 {pendingReqs.length}건</p>
          <div className="flex flex-col gap-2">
            {pendingReqs.map(req => (
              <div key={req.id} className="flex items-center gap-3 rounded-xl bg-muted px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="flex items-center text-sm font-semibold truncate">
                    {req.nickname}<TrophyBadge count={req.trophyCount} />
                  </p>
                </div>
                <button
                  onClick={() => handleRespond(req.id, false, req.nickname)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-muted-foreground/20 text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleRespond(req.id, true, req.nickname)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground"
                >
                  <Check className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 친구 추가 버튼 */}
      <button
        onClick={() => { playButtonTap(); setShowSearch(true) }}
        className="flex items-center gap-2 rounded-xl bg-primary/15 px-4 py-3 text-sm font-semibold text-primary"
      >
        <UserPlus className="h-4 w-4" /> 친구 추가
      </button>

      {/* 리더보드 */}
      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> 불러오는 중...
        </div>
      ) : entries.length <= 1 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          친구를 추가해서 함께 경쟁해 보세요!
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map(e => <LeaderRow key={e.userId} entry={e} />)}
        </div>
      )}

      <AnimatePresence>
        {showSearch && (
          <FriendSearchModal
            onClose={() => setShowSearch(false)}
            onSent={(name) => { setShowSearch(false); showToast(`${name}님에게 친구 요청을 보냈습니다.`) }}
          />
        )}
      </AnimatePresence>

      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-24 left-4 right-4 z-50 mx-auto max-w-md rounded-2xl bg-foreground px-4 py-3 text-center text-sm font-semibold text-background shadow-lg"
        >
          {toast}
        </motion.div>
      )}
    </div>
  )
}

// ─── 메인 화면 ────────────────────────────────────────────────────────────────
export function RankingScreen() {
  const { navigate } = useNavigation()
  const { user, isFullUser, loading } = useMarketplaceUser()
  const { enabled: developerMode } = useDeveloperMode()
  const [tab, setTab] = useState<Tab>('global')

  return (
    <div className="flex flex-col pb-24 min-h-screen">
      <ScreenHeader
        title="랭킹"
        rightElement={
          developerMode ? (
            <button
              onClick={() => navigate({ type: 'ranking-moderation' })}
              className="rounded-xl bg-destructive/15 px-2.5 py-2 text-xs font-bold text-destructive transition-transform active:scale-95"
            >
              랭킹 관리
            </button>
          ) : undefined
        }
      />

      <StatsSection userId={user?.id ?? null} />

      {/* 탭 선택 */}
      <div className="sticky top-0 z-10 flex gap-1 bg-background/95 backdrop-blur-md px-4 pb-2 pt-3">
        {([['global', Trophy, '전체 랭킹'], ['friends', Users, '친구 랭킹']] as [Tab, typeof Trophy, string][]).map(([key, Icon, label]) => (
          <button
            key={key}
            onClick={() => { playButtonTap(); setTab(key) }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-colors ${tab === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, x: tab === 'global' ? -20 : 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            {tab === 'global' && (
              <GlobalRankingTab isGoogleUser={isFullUser} userId={user?.id ?? null} />
            )}
            {tab === 'friends' && (
              <FriendRankingTab isGoogleUser={isFullUser} />
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  )
}
