'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Smartphone } from 'lucide-react'

const STORAGE_KEY = 'recommend_mobile_dismissed'

export function RecommendMobileBanner({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [dontShowAgain, setDontShowAgain] = useState(false)

  const handleConfirm = () => {
    if (dontShowAgain) {
      if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, 'true')
    }
    onClose()
  }

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
            onClick={handleConfirm}
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
                <Smartphone className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  모바일 환경에서 사용하시면 더 좋은 경험을 하실 수 있습니다.
                </p>
              </div>
            </div>
            <label className="mt-4 flex min-h-[44px] cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={e => setDontShowAgain(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary/40"
              />
              <span className="text-xs font-medium text-muted-foreground">다시 보지 않기</span>
            </label>
            <button
              onClick={handleConfirm}
              className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground"
            >
              확인
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export function shouldShowRecommendMobile(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(STORAGE_KEY) !== 'true'
}
