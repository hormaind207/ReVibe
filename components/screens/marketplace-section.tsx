'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useNavigation } from '@/lib/store'
import { ScreenHeader } from '@/components/screen-header'
import { TemplateCard } from '@/components/marketplace/template-card'
import { useMarketplaceUser } from '@/lib/marketplace/auth'
import {
  getMyFavorites,
  getPopularTemplates,
  getOfficialTemplates,
  type TemplateSummary,
} from '@/lib/marketplace/templates'

const SECTION_META = {
  favorites: { title: '즐겨찾기', fetch: (uid: string | null) => getMyFavorites(uid, 100) },
  popular: { title: '인기 템플릿', fetch: (uid: string | null) => getPopularTemplates(uid, 100) },
  official: { title: '공식 템플릿', fetch: (uid: string | null) => getOfficialTemplates(uid, 100) },
} as const

export type MarketplaceSection = keyof typeof SECTION_META

const SECTION_CACHE_TTL_MS = 60_000
const sectionCache = new Map<string, { fetchedAt: number; templates: TemplateSummary[] }>()

export function MarketplaceSectionScreen({ section }: { section: MarketplaceSection }) {
  const { navigate } = useNavigation()
  const { user, loading: authLoading } = useMarketplaceUser()
  const uid = user?.id ?? null
  const meta = SECTION_META[section]

  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    const cacheKey = `${section}:${uid ?? 'guest'}`
    const cached = sectionCache.get(cacheKey)
    if (cached && Date.now() - cached.fetchedAt < SECTION_CACHE_TTL_MS) {
      setTemplates(cached.templates)
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    SECTION_META[section].fetch(uid).then((rows) => {
      if (!active) return
      sectionCache.set(cacheKey, { fetchedAt: Date.now(), templates: rows })
      setTemplates(rows)
      setLoading(false)
    })
    return () => { active = false }
  }, [section, uid, authLoading])

  return (
    <div className="flex flex-col pb-20">
      <ScreenHeader title={meta.title} showBack />

      <div className="px-4">
        {loading || authLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            불러오는 중...
          </div>
        ) : templates.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">템플릿이 없습니다.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 pt-2">
            {templates.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onClick={() => navigate({ type: 'marketplace-template', templateId: t.id })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
