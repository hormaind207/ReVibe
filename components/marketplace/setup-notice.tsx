'use client'

import { CloudOff } from 'lucide-react'

export function MarketplaceSetupNotice() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-8 py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <CloudOff className="h-8 w-8 text-muted-foreground" />
      </div>
      <p className="text-base font-bold text-foreground">마켓플레이스 준비 중</p>
      <p className="text-sm text-muted-foreground leading-relaxed">
        템플릿 공유 기능을 사용하려면 Supabase 연결이 필요합니다.
        <br />
        <code className="text-xs">.env.local</code>에 Supabase URL과 anon key를 입력한 뒤
        앱을 다시 시작해 주세요.
      </p>
    </div>
  )
}
