'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, X } from 'lucide-react'
import { pwaRecommendContent, pwaInstallCta, pwaInstallingLabel } from '@/lib/app-guide-content'
import { PwaManualInstallHint } from '@/components/pwa-manual-install-hint'
import { playButtonTap } from '@/lib/sounds'

const STORAGE_KEY = 'install_pwa_banner_dismissed'

interface InstallPwaBannerProps {
  open: boolean
  onClose: () => void
  onInstall?: () => Promise<void>
  canInstallPrompt: boolean
}

export function InstallPwaBanner({
  open,
  onClose,
  onInstall,
  canInstallPrompt,
}: InstallPwaBannerProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const [installing, setInstalling] = useState(false)

  const handleInstall = useCallback(async () => {
    playButtonTap()
    if (canInstallPrompt && onInstall) {
      setInstalling(true)
      try {
        await onInstall()
        onClose()
      } catch {
        // User dismissed or error
      } finally {
        setInstalling(false)
      }
      return
    }
    if (dontShowAgain && typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, 'true')
    }
    onClose()
  }, [canInstallPrompt, onInstall, onClose, dontShowAgain])

  const handleClose = useCallback(() => {
    if (dontShowAgain && typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, 'true')
    }
    onClose()
  }, [dontShowAgain, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="w-full"
        >
          <div className="rounded-2xl border border-primary/25 bg-card px-4 py-3 shadow-lg">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Download className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {pwaRecommendContent.headline}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {pwaRecommendContent.subline}
                </p>
                {!canInstallPrompt && (
                  <PwaManualInstallHint className="mt-1.5 text-[11px] text-muted-foreground" />
                )}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={handleInstall}
                    disabled={canInstallPrompt && (!onInstall || installing)}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
                  >
                    {installing ? pwaInstallingLabel : pwaInstallCta}
                  </button>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground"
                  >
                    나중에
                  </button>
                </div>
                <label className="mt-2 flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={dontShowAgain}
                    onChange={(e) => setDontShowAgain(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-border text-primary"
                  />
                  <span className="text-[11px] text-muted-foreground">다시 보지 않기</span>
                </label>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="shrink-0 text-muted-foreground"
                aria-label="닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function shouldShowInstallPwaBanner(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(STORAGE_KEY) !== 'true'
}
