'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download } from 'lucide-react'

const STORAGE_KEY = 'install_pwa_banner_dismissed'

interface InstallPwaBannerProps {
  open: boolean
  onClose: () => void
  /** Called when user taps install; parent triggers deferred prompt. */
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
    if (onInstall && canInstallPrompt) {
      setInstalling(true)
      try {
        await onInstall()
        onClose()
      } catch {
        // User dismissed or error
      } finally {
        setInstalling(false)
      }
    } else {
      onClose()
    }
  }, [onInstall, canInstallPrompt, onClose])

  const handleClose = useCallback(() => {
    if (dontShowAgain && typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, 'true')
    }
    onClose()
  }, [dontShowAgain, onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm"
            onClick={handleClose}
          />
          <motion.div
            key="banner"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="fixed left-4 right-4 top-[50%] z-[91] mx-auto max-w-md -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Download className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  앱으로 설치해야 정상 작동합니다.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  앱을 설치하면 홈 화면에서 바로 사용할 수 있습니다.
                </p>
              </div>
            </div>
            {canInstallPrompt ? (
              <button
                onClick={handleInstall}
                disabled={!onInstall || installing}
                className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {installing ? '설치 중...' : '앱 설치'}
              </button>
            ) : (
              <div className="mt-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Safari 사용 시: <strong>공유</strong> 버튼 →{' '}
                  <strong>홈 화면에 추가</strong>를 눌러 설치해 주세요.
                </p>
                <button
                  onClick={handleClose}
                  className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground"
                >
                  확인
                </button>
              </div>
            )}
            <label className="mt-4 flex min-h-[44px] cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={e => setDontShowAgain(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary/40"
              />
              <span className="text-xs font-medium text-muted-foreground">
                다시 보지 않기
              </span>
            </label>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export function shouldShowInstallPwaBanner(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(STORAGE_KEY) !== 'true'
}
