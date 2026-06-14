'use client'

import { type ReactNode } from 'react'
import { WifiOff } from 'lucide-react'
import { ScreenHeader } from '@/components/screen-header'
import { useOnline } from '@/hooks/use-online'

type CloudFeature = 'marketplace' | 'ranking'

const FEATURE_COPY: Record<CloudFeature, { defaultTitle: string; body: string }> = {
  marketplace: {
    defaultTitle: '마켓플레이스',
    body: '오프라인 상태에서는 마켓플레이스를 이용할 수 없습니다. 인터넷 연결 후 다시 시도해 주세요.',
  },
  ranking: {
    defaultTitle: '랭킹',
    body: '오프라인 상태에서는 랭킹을 볼 수 없습니다. 인터넷 연결 후 다시 시도해 주세요.',
  },
}

export function CloudOfflineGate({
  feature,
  title,
  showBack,
  children,
}: {
  feature: CloudFeature
  title?: string
  showBack?: boolean
  children: ReactNode
}) {
  const online = useOnline()
  const copy = FEATURE_COPY[feature]

  if (online) return <>{children}</>

  return (
    <div className="flex min-h-screen min-h-dvh flex-col pb-20">
      <ScreenHeader title={title ?? copy.defaultTitle} showBack={showBack} />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <WifiOff className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="text-base font-bold text-foreground">오프라인</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{copy.body}</p>
      </div>
    </div>
  )
}
