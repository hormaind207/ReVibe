'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Search, X, FolderHeart, Star, Flame, Hash, Loader2, ChevronRight, ShieldAlert, BadgeCheck } from 'lucide-react'
import { motion } from 'framer-motion'
import { useNavigation } from '@/lib/store'
import { useDragScroll } from '@/hooks/use-drag-scroll'
import { ScreenHeader } from '@/components/screen-header'
import { TemplateCard } from '@/components/marketplace/template-card'
import { MarketplaceSetupNotice } from '@/components/marketplace/setup-notice'
import { useMarketplaceUser } from '@/lib/marketplace/auth'
import { useDeveloperMode } from '@/lib/hooks/use-developer-mode'
import {
  listTemplates,
  getPopularTemplates,
  getOfficialTemplates,
  getMyFavorites,
  getTemplatesByHashtag,
  searchTemplates,
  type TemplateSummary,
} from '@/lib/marketplace/templates'
import { getPopularHashtags } from '@/lib/marketplace/hashtags'
import { displayTag } from '@/lib/marketplace/hashtags'

interface HashtagGroup {
  tag: string
  templates: TemplateSummary[]
}

const MARKETPLACE_CACHE_TTL_MS = 60_000

type MarketplaceHomeCache = {
  uid: string | null
  fetchedAt: number
  favorites: TemplateSummary[]
  popular: TemplateSummary[]
  official: TemplateSummary[]
  groups: HashtagGroup[]
}

let marketplaceHomeCache: MarketplaceHomeCache | null = null

function getValidMarketplaceHomeCache(uid: string | null): MarketplaceHomeCache | null {
  if (!marketplaceHomeCache || marketplaceHomeCache.uid !== uid) return null
  if (Date.now() - marketplaceHomeCache.fetchedAt > MARKETPLACE_CACHE_TTL_MS) return null
  return marketplaceHomeCache
}

function SectionCarousel({
  title,
  icon,
  templates,
  onOpen,
  onViewAll,
}: {
  title: React.ReactNode
  icon: React.ReactNode
  templates: TemplateSummary[]
  onOpen: (id: string) => void
  onViewAll?: () => void
}) {
  const drag = useDragScroll()
  if (templates.length === 0) return null
  return (
    <section>
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-base font-bold text-foreground">
          {icon}
          {title}
        </h2>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="flex items-center gap-0.5 text-xs font-semibold text-primary"
          >
            전체보기 <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div
        ref={drag.ref}
        className="flex gap-3 overflow-x-auto pb-2 scrollbar-none scroll-fade select-none"
        style={{ cursor: 'grab' }}
        onMouseDown={drag.onMouseDown}
        onMouseMove={drag.onMouseMove}
        onMouseUp={drag.onMouseUp}
        onMouseLeave={drag.onMouseLeave}
        onClick={drag.preventClickIfDragged}
      >
        {templates.map((t) => (
          <TemplateCard key={t.id} template={t} compact onClick={() => onOpen(t.id)} />
        ))}
      </div>
    </section>
  )
}

export function MarketplaceScreen() {
  const { navigate } = useNavigation()
  const { configured, loading: authLoading, user } = useMarketplaceUser()
  const { enabled: developerMode } = useDeveloperMode()
  const uid = user?.id ?? null

  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<TemplateSummary[] | null>(null)
  const [searching, setSearching] = useState(false)

  const [favorites, setFavorites] = useState<TemplateSummary[]>([])
  const [popular, setPopular] = useState<TemplateSummary[]>([])
  const [official, setOfficial] = useState<TemplateSummary[]>([])
  const [groups, setGroups] = useState<HashtagGroup[]>([])
  const [all, setAll] = useState<TemplateSummary[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [allLoading, setAllLoading] = useState(false)
  const allSectionRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!configured || authLoading) return
    const cached = getValidMarketplaceHomeCache(uid)
    if (cached) {
      setFavorites(cached.favorites)
      setPopular(cached.popular)
      setOfficial(cached.official)
      setGroups(cached.groups)
      setLoadingData(false)
      return
    }
    let active = true
    setLoadingData(true)
    ;(async () => {
      const [fav, pop, off, popTags] = await Promise.all([
        getMyFavorites(uid),
        getPopularTemplates(uid),
        getOfficialTemplates(uid),
        getPopularHashtags(3),
      ])
      const grp = await Promise.all(
        popTags.slice(0, 6).map(async (t) => ({
          tag: t.tag,
          templates: await getTemplatesByHashtag(t.tag, uid),
        }))
      )
      if (!active) return
      const nextGroups = grp.filter((g) => g.templates.length > 0)
      marketplaceHomeCache = {
        uid,
        fetchedAt: Date.now(),
        favorites: fav,
        popular: pop,
        official: off,
        groups: nextGroups,
      }
      setFavorites(fav)
      setPopular(pop)
      setOfficial(off)
      setGroups(nextGroups)
      setLoadingData(false)
    })()
    return () => {
      active = false
    }
  }, [configured, authLoading, uid])

  const loadAllTemplates = useCallback(async () => {
    if (all.length > 0 || allLoading) return
    setAllLoading(true)
    const rows = await listTemplates(uid)
    setAll(rows)
    setAllLoading(false)
  }, [all.length, allLoading, uid])

  useEffect(() => {
    if (loadingData || searchResults !== null) return
    const el = allSectionRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadAllTemplates()
      },
      { rootMargin: '120px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadingData, searchResults, loadAllTemplates])

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setSearchResults(null)
      setSearching(false)
      return
    }
    let active = true
    setSearching(true)
    const t = setTimeout(async () => {
      const res = await searchTemplates(q, uid)
      // Ignore stale responses from a previous query/uid.
      if (!active) return
      setSearchResults(res)
      setSearching(false)
    }, 320)
    return () => {
      active = false
      clearTimeout(t)
    }
  }, [query, uid])

  const openTemplate = (id: string) => navigate({ type: 'marketplace-template', templateId: id })

  if (!configured) {
    return (
      <div className="flex flex-col pb-20">
        <ScreenHeader title="마켓플레이스" />
        <MarketplaceSetupNotice />
      </div>
    )
  }

  return (
    <div className="flex flex-col pb-20">
      <ScreenHeader
        title="마켓플레이스"
        rightElement={
          <div className="flex items-center gap-1.5">
            {developerMode && (
              <button
                onClick={() => navigate({ type: 'marketplace-moderation' })}
                className="flex items-center gap-1 rounded-xl bg-destructive/15 px-2.5 py-2 text-xs font-bold text-destructive transition-transform active:scale-95"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                숨김 검토
              </button>
            )}
            <button
              onClick={() => navigate({ type: 'my-templates' })}
              className="flex items-center gap-1.5 rounded-xl bg-primary/15 px-3 py-2 text-xs font-bold text-primary transition-transform active:scale-95"
            >
              <FolderHeart className="h-4 w-4" />
              나의 템플릿
            </button>
          </div>
        }
      />

      <div className="flex flex-col gap-6 px-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="템플릿 이름, 게시자, #해시태그 검색"
            className="w-full rounded-2xl border border-border bg-background py-3 pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-label="검색어 지우기"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Search results */}
        {searchResults !== null ? (
          <section>
            {searching ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                검색 중...
              </div>
            ) : searchResults.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                검색 결과가 없습니다.
              </p>
            ) : (
              <>
                <h2 className="mb-2.5 text-base font-bold text-foreground">검색 결과 {searchResults.length}개</h2>
                <div className="grid grid-cols-2 gap-3">
                  {searchResults.map((t) => (
                    <TemplateCard key={t.id} template={t} onClick={() => openTemplate(t.id)} />
                  ))}
                </div>
              </>
            )}
          </section>
        ) : loadingData ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            불러오는 중...
          </div>
        ) : favorites.length === 0 && popular.length === 0 && official.length === 0 && groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <p className="text-sm font-semibold text-foreground">아직 공유된 템플릿이 없습니다.</p>
            <p className="text-xs text-muted-foreground">첫 번째 템플릿을 만들어 공유해 보세요!</p>
            <button
              onClick={() => navigate({ type: 'my-templates' })}
              className="mt-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
            >
              나의 템플릿으로 이동
            </button>
          </div>
        ) : (
          <motion.div
            className="flex flex-col gap-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <SectionCarousel
              title="즐겨찾기"
              icon={<Star className="h-4 w-4 text-amber-500" />}
              templates={favorites}
              onOpen={openTemplate}
              onViewAll={() => navigate({ type: 'marketplace-section', section: 'favorites' })}
            />
            <SectionCarousel
              title="인기 템플릿"
              icon={<Flame className="h-4 w-4 text-orange-500" />}
              templates={popular}
              onOpen={openTemplate}
              onViewAll={() => navigate({ type: 'marketplace-section', section: 'popular' })}
            />
            <SectionCarousel
              title="공식 템플릿"
              icon={<BadgeCheck className="h-4 w-4 text-primary" />}
              templates={official}
              onOpen={openTemplate}
              onViewAll={() => navigate({ type: 'marketplace-section', section: 'official' })}
            />
            {groups.map((g) => (
              <SectionCarousel
                key={g.tag}
                title={displayTag(g.tag)}
                icon={<Hash className="h-4 w-4 text-primary" />}
                templates={g.templates}
                onOpen={openTemplate}
                onViewAll={() => navigate({ type: 'marketplace-hashtag', tag: g.tag })}
              />
            ))}
            <section ref={allSectionRef}>
              <h2 className="mb-2.5 text-base font-bold text-foreground">전체 템플릿</h2>
              {allLoading && all.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  불러오는 중...
                </div>
              ) : all.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">스크롤하면 전체 목록을 불러옵니다.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {all.map((t) => (
                    <TemplateCard key={t.id} template={t} onClick={() => openTemplate(t.id)} />
                  ))}
                </div>
              )}
            </section>
          </motion.div>
        )}
      </div>
    </div>
  )
}
