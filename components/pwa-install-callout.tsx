'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, CheckCircle2 } from 'lucide-react'
import { pwaRecommendContent, pwaInstallCta, pwaInstallingLabel } from '@/lib/app-guide-content'
import { PwaManualInstallHint } from '@/components/pwa-manual-install-hint'
import { useIsPwa, useDeferredInstallPrompt } from '@/lib/use-pwa-install'
import { playButtonTap } from '@/lib/sounds'

interface PwaInstallCalloutProps {
  className?: string
  onInstallSuccess?: () => void
}

/** Prominent PWA install CTA — hidden when already installed. */
export function PwaInstallCallout({ className = '', onInstallSuccess }: PwaInstallCalloutProps) {
  const isPwa = useIsPwa()
  const { canInstall, triggerInstall } = useDeferredInstallPrompt()
  const [installing, setInstalling] = useState(false)

  const handleInstall = useCallback(async () => {
    playButtonTap()
    if (canInstall) {
      setInstalling(true)
      try {
        const outcome = await triggerInstall()
        if (outcome === 'accepted') onInstallSuccess?.()
      } finally {
        setInstalling(false)
      }
    }
  }, [canInstall, triggerInstall, onInstallSuccess])

  if (isPwa) {
    return (
      <div className={`rounded-2xl border border-success/30 bg-success/10 p-4 ${className}`}>
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-8 w-8 shrink-0 text-success" />
          <div>
            <p className="text-sm font-bold text-foreground">앱 설치 완료</p>
            <p className="text-xs text-muted-foreground">홈 화면에서 ReVibe를 실행 중입니다.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`rounded-2xl border-2 border-primary/40 bg-primary/10 p-4 shadow-sm ${className}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary">
          <Download className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground">{pwaRecommendContent.headline}</p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{pwaRecommendContent.subline}</p>
          <ul className="mt-2 space-y-1">
            {pwaRecommendContent.benefits.map((b) => (
              <li key={b.title} className="text-[11px] text-muted-foreground">
                <span className="mr-1">{b.emoji}</span>
                <strong className="text-foreground">{b.title}</strong> — {b.desc}
              </li>
            ))}
          </ul>
        </div>
      </div>
      {canInstall ? (
        <button
          type="button"
          onClick={handleInstall}
          disabled={installing}
          className="mt-3 w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {installing ? pwaInstallingLabel : pwaInstallCta}
        </button>
      ) : (
        <PwaManualInstallHint className="mt-3 text-[11px] text-muted-foreground" />
      )}
    </div>
  )
}
