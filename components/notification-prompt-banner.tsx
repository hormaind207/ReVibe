'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, X } from 'lucide-react'
import { notificationPromptContent } from '@/lib/app-guide-content'
import { playButtonTap } from '@/lib/sounds'

const STORAGE_KEY = 'notification_prompt_dismissed'

export function shouldShowNotificationPrompt(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(STORAGE_KEY) !== 'true'
}

export function dismissNotificationPromptPermanently(): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, 'true')
  }
}

interface NotificationPromptBannerProps {
  open: boolean
  onEnable: () => void
  onDismiss: () => void
}

export function NotificationPromptBanner({
  open,
  onEnable,
  onDismiss,
}: NotificationPromptBannerProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false)

  const handleDismiss = () => {
    if (dontShowAgain) dismissNotificationPromptPermanently()
    onDismiss()
  }

  const handleEnable = () => {
    playButtonTap()
    if (dontShowAgain) dismissNotificationPromptPermanently()
    onEnable()
  }

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
                <Bell className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{notificationPromptContent.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {notificationPromptContent.body}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={handleEnable}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
                  >
                    알림 켜기
                  </button>
                  <button
                    onClick={handleDismiss}
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
                onClick={handleDismiss}
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
