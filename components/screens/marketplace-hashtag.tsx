'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useNavigation } from '@/lib/store'
import { ScreenHeader } from '@/components/screen-header'
import { TemplateCard } from '@/components/marketplace/template-card'
import { useMarketplaceUser } from '@/lib/marketplace/auth'
import { getTemplatesByHashtag, type TemplateSummary } from '@/lib/marketplace/templates'
import { displayTag } from '@/lib/marketplace/hashtags'

export function MarketplaceHashtagScreen({ tag }: { tag: string }) {
  const { navigate } = useNavigation()
  const { user, loading: authLoading } = useMarketplaceUser()
  const uid = user?.id ?? null

  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    let active = true
    setLoading(true)
    getTemplatesByHashtag(tag, uid, 100).then((rows) => {
      if (active) {
        setTemplates(rows)
        setLoading(false)
      }
    })
    return () => { active = false }
  }, [tag, uid, authLoading])

  return (
    <div className="flex flex-col pb-20">
      <ScreenHeader title={displayTag(tag)} showBack />

      <div className="px-4">
        {loading || authLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            불러오는 중...
          </div>
        ) : templates.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">해당 해시태그의 템플릿이 없습니다.</p>
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
