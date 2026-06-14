'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, Ban, Search, UserX } from 'lucide-react'
import { ScreenHeader } from '@/components/screen-header'
import { useDeveloperMode } from '@/lib/hooks/use-developer-mode'
import {
  listRankingBlockedUsers,
  adminSearchProfiles,
  hideRankingUser,
  unhideRankingUser,
  type RankingBlockedUser,
  type AdminProfileSearchResult,
} from '@/lib/ranking/moderation'
import { playButtonTap } from '@/lib/sounds'

export function RankingModerationScreen() {
  const { enabled: developerMode } = useDeveloperMode()
  const [blocked, setBlocked] = useState<RankingBlockedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<AdminProfileSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  const reloadBlocked = useCallback(async () => {
    setLoading(true)
    const rows = await listRankingBlockedUsers()
    setBlocked(rows)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!developerMode) return
    reloadBlocked()
  }, [developerMode, reloadBlocked])

  const handleSearch = async () => {
    if (!query.trim()) return
    playButtonTap()
    setSearching(true)
    const rows = await adminSearchProfiles(query)
    setSearchResults(rows)
    setSearching(false)
  }

  const handleBlock = async (userId: string, nickname: string) => {
    playButtonTap()
    setBusyId(userId)
    const ok = await hideRankingUser(userId)
    setBusyId(null)
    if (ok) {
      flash(`${nickname}님을 랭킹에서 차단했습니다.`)
      reloadBlocked()
      setSearchResults((prev) => prev.map((r) => (r.userId === userId ? { ...r, rankingHidden: true } : r)))
    } else {
      flash('차단에 실패했습니다.')
    }
  }

  const handleUnblock = async (userId: string, nickname: string) => {
    playButtonTap()
    setBusyId(userId)
    const ok = await unhideRankingUser(userId)
    setBusyId(null)
    if (ok) {
      flash(`${nickname}님의 랭킹 차단을 해제했습니다.`)
      reloadBlocked()
    } else {
      flash('해제에 실패했습니다.')
    }
  }

  if (!developerMode) {
    return (
      <div className="flex flex-col pb-20">
        <ScreenHeader title="랭킹 관리" showBack />
        <p className="px-4 py-16 text-center text-sm text-muted-foreground">
          개발자 모드가 꺼져 있습니다.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col pb-20">
      <ScreenHeader title="랭킹 관리" showBack />

      <div className="flex flex-col gap-6 px-4">
        <section>
          <p className="mb-3 text-xs text-muted-foreground">
            닉네임으로 사용자를 검색해 전체 랭킹에서 숨길 수 있습니다. 차단된 사용자에게는 안내가 표시됩니다.
          </p>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="닉네임 검색..."
              className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
          {searching && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!searching && searchResults.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {searchResults.map((r) => (
                <div key={r.userId} className="flex items-center gap-3 rounded-xl bg-card px-3 py-2.5 shadow-sm">
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{r.nickname}</p>
                    {r.rankingHidden && (
                      <p className="text-[10px] font-semibold text-destructive">차단됨</p>
                    )}
                  </div>
                  {!r.rankingHidden && (
                    <button
                      onClick={() => handleBlock(r.userId, r.nickname)}
                      disabled={busyId === r.userId}
                      className="flex items-center gap-1 rounded-xl bg-destructive/15 px-3 py-1.5 text-xs font-bold text-destructive disabled:opacity-50"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      차단
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-foreground">
            <UserX className="h-4 w-4 text-destructive" />
            차단 목록
          </h2>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              불러오는 중...
            </div>
          ) : blocked.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">차단된 사용자가 없습니다.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {blocked.map((u) => (
                <div key={u.userId} className="flex items-center gap-3 rounded-xl bg-card px-3 py-2.5 shadow-sm">
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{u.nickname}</p>
                  </div>
                  <button
                    onClick={() => handleUnblock(u.userId, u.nickname)}
                    disabled={busyId === u.userId}
                    className="rounded-xl bg-primary/15 px-3 py-1.5 text-xs font-bold text-primary disabled:opacity-50"
                  >
                    해제
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {toast && (
        <div className="fixed left-4 right-4 top-4 z-[80] mx-auto max-w-md rounded-xl bg-primary px-4 py-3 text-center text-sm font-medium text-primary-foreground shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
