'use client'

import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, X } from 'lucide-react'

interface OnboardingProps {
  onComplete: () => void
}

const slides = [
  {
    emoji: '🧠',
    title: 'ReVibe에 오신 것을\n환영합니다!',
    description: '간격 반복 학습법으로 효율적으로 암기하세요. 한 번 배운 것을 오래도록 기억할 수 있어요.',
    bg: 'from-purple-100 to-purple-50',
    accent: '#b19cd9',
    illustration: (
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
    ),
  },
  {
    emoji: '📶',
    title: '오프라인에서도\n사용할 수 있어요',
    description: '모든 데이터는 기기에 저장됩니다. Wi‑Fi나 데이터가 없어도 언제 어디서나 복습하고 카드를 추가할 수 있어요.',
    bg: 'from-slate-100 to-slate-50',
    accent: '#64748b',
    illustration: (
      <div className="relative flex h-48 items-center justify-center gap-4">
        {['📵', '📱', '✨'].map((e, i) => (
          <motion.div
            key={e}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 + i * 0.15, type: 'spring', stiffness: 200 }}
            className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/90 shadow-md text-3xl"
          >
            {e}
          </motion.div>
        ))}
      </div>
    ),
  },
  {
    emoji: '📂',
    title: '카테고리로\n체계적으로 분류',
    description: '영어 단어, 수학 공식, 역사 사건... 주제별로 카테고리를 만들고 카드를 추가하세요.',
    bg: 'from-blue-100 to-blue-50',
    accent: '#89cff0',
    illustration: (
      <div className="relative flex h-48 items-center justify-center gap-3">
        {[
          { emoji: '🌐', label: '언어', color: '#e8d5f5' },
          { emoji: '📐', label: '수학', color: '#d6eaf8' },
          { emoji: '🔬', label: '과학', color: '#d4edda' },
        ].map((cat, i) => (
          <motion.div
            key={cat.label}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 + i * 0.15 }}
            className="flex flex-col items-center gap-1.5 rounded-2xl p-4 shadow-md"
            style={{ backgroundColor: cat.color }}
          >
            <span className="text-2xl">{cat.emoji}</span>
            <span className="text-xs font-bold text-gray-700">{cat.label}</span>
          </motion.div>
        ))}
      </div>
    ),
  },
  {
    emoji: '🃏',
    title: '플래시카드로\n스마트하게 암기',
    description: '앞면에 문제, 뒷면에 정답을 적어 카드를 만드세요. 홈 화면에서 빠르게 추가할 수 있어요.',
    bg: 'from-emerald-100 to-emerald-50',
    accent: '#a8d8b9',
    illustration: (
      <div className="relative flex h-48 items-center justify-center">
        <motion.div
          initial={{ rotateY: 0 }}
          animate={{ rotateY: [0, 10, 0] }}
          transition={{ delay: 0.3, duration: 1.2, ease: 'easeInOut' }}
          className="relative"
        >
          <div className="flex h-28 w-48 flex-col items-center justify-center rounded-2xl bg-white shadow-lg">
            <span className="text-xs font-semibold text-gray-400 mb-2">앞면 (문제)</span>
            <span className="text-lg font-bold text-gray-800">Ephemeral</span>
            <span className="mt-2 text-[10px] text-gray-400">탭하여 정답 확인</span>
          </div>
        </motion.div>
      </div>
    ),
  },
  {
    emoji: '🔁',
    title: '라이트너 시스템으로\n최적의 복습',
    description: '잘 외운 카드는 점점 긴 간격으로, 틀린 카드는 자주! 최소한의 시간으로 최대의 효과를 낼 수 있어요.',
    bg: 'from-amber-100 to-amber-50',
    accent: '#fdb99b',
    illustration: (
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
    ),
  },
  {
    emoji: '🎯',
    title: '매일 복습하고\n졸업을 향해!',
    description: '홈 화면에서 오늘의 복습 카드를 확인하세요. 모든 단계를 통과하면 카드가 "졸업" 상태가 됩니다.\n\n💡 이 가이드는 설정에서 다시 볼 수 있어요!',
    bg: 'from-pink-100 to-pink-50',
    accent: '#f4a7bb',
    illustration: (
      <div className="flex h-48 items-center justify-center">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
          className="flex flex-col items-center gap-3"
        >
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-amber-100 shadow-lg">
            <span className="text-5xl">🎓</span>
            <motion.div
              className="absolute -inset-2 rounded-full border-4 border-amber-300"
              animate={{ scale: [1, 1.1, 1], opacity: [1, 0.5, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
            />
          </div>
          <div className="flex gap-1">
            {['⭐', '⭐', '⭐'].map((s, i) => (
              <motion.span
                key={i}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5 + i * 0.1 }}
                className="text-2xl"
              >
                {s}
              </motion.span>
            ))}
          </div>
        </motion.div>
      </div>
    ),
  },
  {
    emoji: '☁️',
    title: 'Google Drive로\n실시간 동기화 & 백업',
    description: '같은 Google 계정으로 연결하면 여러 기기에서 데이터가 자동으로 맞춰져요. 한 기기만 쓰셔도 "수동 백업"으로 원하는 시점을 날짜별로 저장해 두고, "백업 불러오기"에서 골라 복원할 수 있어요.\n\n💡 이 가이드는 설정에서 다시 볼 수 있어요!',
    bg: 'from-sky-100 to-sky-50',
    accent: '#7dd3fc',
    illustration: (
      <div className="flex h-48 items-center justify-center gap-4">
        {['📱', '☁️', '💻'].map((emoji, i) => (
          <motion.div
            key={emoji}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 + i * 0.15, type: 'spring', stiffness: 200 }}
            className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/80 shadow-md text-2xl"
          >
            {emoji}
          </motion.div>
        ))}
      </div>
    ),
  },
]

export function Onboarding({ onComplete }: OnboardingProps) {
  const [current, setCurrent] = useState(0)
  const touchStartX = useRef<number | null>(null)
  const isLast = current === slides.length - 1
  const slide = slides[current]

  const next = () => {
    if (isLast) {
      localStorage.setItem('onboarding_done', 'true')
      onComplete()
    } else {
      setCurrent(c => c + 1)
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
    if (diff > 50 && !isLast) setCurrent(c => c + 1)
    if (diff < -50 && current > 0) setCurrent(c => c - 1)
    touchStartX.current = null
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className={`flex flex-1 flex-col bg-gradient-to-b ${slide.bg}`}>
        {/* Skip button */}
        <div className="flex justify-end p-4">
          <button
            onClick={skip}
            className="flex items-center gap-1 rounded-full bg-black/10 px-3 py-1.5 text-xs font-semibold text-gray-600"
          >
            <X className="h-3 w-3" />
            건너뛰기
          </button>
        </div>

        {/* Slide content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="flex flex-1 flex-col items-center px-6"
          >
            {/* Illustration */}
            <div className="w-full max-w-xs">
              {slide.illustration}
            </div>

            {/* Text */}
            <div className="mt-2 flex flex-col items-center gap-3 text-center">
              <h2 className="text-2xl font-extrabold text-gray-800 whitespace-pre-line leading-tight">
                {slide.title}
              </h2>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line max-w-xs">
                {slide.description}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Pagination dots */}
        <div className="flex justify-center gap-2 py-4">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === current ? 'w-6 bg-gray-700' : 'w-2 bg-gray-300'
              }`}
            />
          ))}
        </div>

        {/* CTA button */}
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
        </div>
      </div>
    </div>
  )
}
