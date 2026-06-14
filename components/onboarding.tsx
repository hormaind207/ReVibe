'use client'

import { useState, useRef, useMemo } from 'react'
import { playOnboardingComplete } from '@/lib/sounds'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, X } from 'lucide-react'
import {
  getIdentitySlidesForPwa,
  pwaRecommendContent,
  formatGuideText,
  type IdentitySlideId,
} from '@/lib/app-guide-content'
import { useIsPwa } from '@/lib/use-pwa-install'

interface OnboardingProps {
  onComplete: () => void
}

function SlideIllustration({ id }: { id: IdentitySlideId }) {
  switch (id) {
    case 'welcome':
      return (
        <div className="relative flex h-48 items-center justify-center">
          <div className="flex gap-3">
            {['🧠', '📚', '✨'].map((e, i) => (
              <motion.div
                key={e}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2 + i * 0.15, type: 'spring', stiffness: 200 }}
                className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/80 shadow-md text-3xl"
              >
                {e}
              </motion.div>
            ))}
          </div>
        </div>
      )
    case 'leitner':
      return (
        <div className="flex h-48 items-center justify-center">
          <div className="flex items-end gap-2">
            {[
              { label: '매일', height: 24, color: '#e8d5f5' },
              { label: '이틀', height: 36, color: '#d4edda' },
              { label: '1주', height: 52, color: '#d6eaf8' },
              { label: '2주', height: 68, color: '#fce4b8' },
              { label: '첫 달', height: 88, color: '#fdb99b' },
              { label: '졸업', height: 104, color: '#f0e6d3' },
            ].map((bar, i) => (
              <motion.div
                key={bar.label}
                className="flex flex-col items-center gap-1"
                initial={{ scaleY: 0, opacity: 0 }}
                animate={{ scaleY: 1, opacity: 1 }}
                style={{ originY: 1 }}
                transition={{ delay: 0.2 + i * 0.1, type: 'spring', stiffness: 200 }}
              >
                <div
                  className="w-8 rounded-t-lg"
                  style={{ height: bar.height, backgroundColor: bar.color }}
                />
                <span className="text-[9px] font-semibold text-gray-500">{bar.label}</span>
              </motion.div>
            ))}
          </div>
        </div>
      )
    case 'custom':
      return (
        <div className="relative flex h-48 items-center justify-center gap-2 flex-wrap max-w-xs">
          {['7단계', '졸업', '스택', '대기함', '병합'].map((label, i) => (
            <motion.span
              key={label}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15 + i * 0.08, type: 'spring', stiffness: 220 }}
              className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-gray-700 shadow-md"
            >
              {label}
            </motion.span>
          ))}
        </div>
      )
    case 'flow':
      return (
        <div className="flex h-48 items-center justify-center">
          <div className="flex flex-col gap-2">
            {['카테고리', '카드 추가', '대기 → 1단계', '매일 복습', '졸업 🎓'].map((step, i) => (
              <motion.div
                key={step}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.2 + i * 0.1 }}
                className="flex items-center gap-2"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-[10px] font-bold text-gray-600 shadow">
                  {i + 1}
                </span>
                <span className="text-sm font-semibold text-gray-700">{step}</span>
              </motion.div>
            ))}
          </div>
        </div>
      )
    case 'pwa':
      return (
        <div className="relative flex h-48 items-center justify-center gap-4">
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
            className="relative flex h-36 w-20 flex-col items-center rounded-2xl border-4 border-gray-800 bg-gray-900 p-1 shadow-xl"
          >
            <div className="h-2 w-full rounded-sm bg-gray-700" />
            <div className="mt-2 flex flex-1 flex-col items-center justify-center gap-2">
              <img src="/icon.png" alt="" className="h-10 w-10 rounded-xl" />
              <span className="text-[8px] font-bold text-white">ReVibe</span>
            </div>
          </motion.div>
          <div className="flex flex-col gap-1.5 max-w-[140px]">
            {pwaRecommendContent.benefits.map((b, i) => (
              <motion.div
                key={b.title}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.12 }}
                className="rounded-lg bg-white/80 px-2 py-1 text-[10px] text-gray-600 shadow-sm"
              >
                {b.emoji} {b.title}
              </motion.div>
            ))}
          </div>
        </div>
      )
    case 'pwa-done':
      return (
        <div className="flex h-48 items-center justify-center">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200 }}
            className="flex h-24 w-24 items-center justify-center rounded-full bg-green-100 shadow-lg text-5xl"
          >
            ✅
          </motion.div>
        </div>
      )
    case 'start':
      return (
        <div className="flex h-48 items-center justify-center">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
            className="flex flex-col items-center gap-3"
          >
            <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-amber-100 shadow-lg">
              <span className="text-5xl">🚀</span>
            </div>
          </motion.div>
        </div>
      )
    default:
      return null
  }
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const isPwa = useIsPwa()
  const slides = useMemo(() => getIdentitySlidesForPwa(isPwa), [isPwa])
  const [current, setCurrent] = useState(0)
  const touchStartX = useRef<number | null>(null)
  const isLast = current === slides.length - 1
  const slide = slides[current]

  const next = () => {
    if (isLast) {
      playOnboardingComplete()
      localStorage.setItem('onboarding_done', 'true')
      onComplete()
    } else {
      setCurrent((c) => c + 1)
    }
  }

  const skip = () => {
    localStorage.setItem('onboarding_done', 'true')
    onComplete()
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (diff > 50 && !isLast) setCurrent((c) => c + 1)
    if (diff < -50 && current > 0) setCurrent((c) => c - 1)
    touchStartX.current = null
  }

  if (!slide) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className={`flex flex-1 flex-col bg-gradient-to-b ${slide.bg}`}>
        <div className="flex justify-end p-4">
          <button
            onClick={skip}
            className="flex items-center gap-1 rounded-full bg-black/10 px-3 py-1.5 text-xs font-semibold text-gray-600"
          >
            <X className="h-3 w-3" />
            건너뛰기
          </button>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="flex flex-1 flex-col items-center px-6"
          >
            <div className="w-full max-w-xs">
              <SlideIllustration id={slide.id} />
            </div>

            <div className="mt-2 flex flex-col items-center gap-3 text-center">
              <h2 className="text-2xl font-extrabold text-gray-800 whitespace-pre-line leading-tight">
                {slide.title}
              </h2>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line max-w-xs">
                {formatGuideText(slide.description)}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="flex justify-center gap-2 py-4">
          {slides.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setCurrent(i)}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === current ? 'w-6 bg-gray-700' : 'w-2 bg-gray-300'
              }`}
            />
          ))}
        </div>

        <div className="px-6 pb-10">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={next}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold text-white shadow-lg transition-all active:shadow-sm"
            style={{ backgroundColor: slide.accent }}
          >
            {isLast ? (
              <>
                <span>🚀</span>
                시작하기
              </>
            ) : (
              <>
                다음
                <ChevronRight className="h-5 w-5" />
              </>
            )}
          </motion.button>
          {isLast && (
            <p className="mt-2 text-center text-[11px] text-gray-500">
              자세한 기능은 프로필·설정의 완전 가이드에서 · 설치는 상단 배너에서도 안내해요
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
