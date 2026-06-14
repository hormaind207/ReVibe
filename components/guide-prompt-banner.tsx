'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, X } from 'lucide-react'
import { guidePromptContent, formatGuideText } from '@/lib/app-guide-content'
import { playButtonTap } from '@/lib/sounds'

interface GuidePromptBannerProps {
  open: boolean
  onReadGuide: () => void
  onLater: () => void
}

export function GuidePromptBanner({ open, onReadGuide, onLater }: GuidePromptBannerProps) {
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
                <BookOpen className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{guidePromptContent.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatGuideText(guidePromptContent.body)}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {guidePromptContent.persistNote}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {guidePromptContent.entryNote}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      playButtonTap()
                      onReadGuide()
                    }}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
                  >
                    {guidePromptContent.readCta}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      playButtonTap()
                      onLater()
                    }}
                    className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground"
                  >
                    {guidePromptContent.laterCta}
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={onLater}
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
