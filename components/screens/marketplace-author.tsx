'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useNavigation } from '@/lib/store'
import { ScreenHeader } from '@/components/screen-header'
import { TemplateCard } from '@/components/marketplace/template-card'
import { useMarketplaceUser } from '@/lib/marketplace/auth'
import { getTemplatesByOwner, type TemplateSummary } from '@/lib/marketplace/templates'
import { getSupabase } from '@/lib/supabase'

export function MarketplaceAuthorScreen({ ownerId }: { ownerId: string }) {
  const { navigate } = useNavigation()
  const { user, loading: authLoading } = useMarketplaceUser()
  const uid = user?.id ?? null

  const [nickname, setNickname] = useState<string>('게시자')
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    let active = true
    setLoading(true)
    ;(async () => {
      const sb = getSupabase()
      const [rows, profileRes] = await Promise.all([
        getTemplatesByOwner(ownerId, uid),
        sb ? sb.from('profiles').select('nickname').eq('id', ownerId).single() : Promise.resolve({ data: null }),
      ])
      if (!active) return
      if (profileRes.data) setNickname((profileRes.data as { nickname: string }).nickname)
      setTemplates(rows)
      setLoading(false)
    })()
    return () => { active = false }
  }, [ownerId, uid, authLoading])

  return (
    <div className="flex flex-col pb-20">
      <ScreenHeader title={`${nickname}의 템플릿`} showBack />

      <div className="px-4">
        {loading || authLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            불러오는 중...
          </div>
        ) : templates.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">공유된 템플릿이 없습니다.</p>
        ) : (
          <>
            <p className="pb-3 pt-2 text-xs text-muted-foreground">
              총 {templates.length}개의 템플릿
            </p>
            <div className="grid grid-cols-2 gap-3">
              {templates.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onClick={() => navigate({ type: 'marketplace-template', templateId: t.id })}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
