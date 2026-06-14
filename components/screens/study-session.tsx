'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { X, Check, ChevronLeft, RotateCcw } from 'lucide-react'
import { useNavigation } from '@/lib/store'
import { useStack } from '@/lib/hooks/use-stacks'
import { useCards } from '@/lib/hooks/use-cards'
import { useCategory } from '@/lib/hooks/use-categories'
import { ScreenHeader } from '@/components/screen-header'
import { Progress } from '@/components/ui/progress'
import { playReviewStart, playSuccessPing, playFail, playCardFlip } from '@/lib/sounds'
import type { DBCard } from '@/lib/db'

interface StudySessionProps {
  categoryId: string
  stackId: string
}

export function StudySession({ categoryId, stackId }: StudySessionProps) {
  const { goBack } = useNavigation()
  const stack = useStack(stackId)
  const liveCards = useCards(stackId) ?? []
  const snapshotRef = useRef<DBCard[] | null>(null)
  const [sessionKey, setSessionKey] = useState(0)
  if (snapshotRef.current === null && liveCards.length > 0) {
    snapshotRef.current = liveCards
  }
  const cards = snapshotRef.current ?? liveCards
  const category = useCategory(categoryId)

  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [results, setResults] = useState<Map<string, 'pass' | 'fail'>>(new Map())
  const [showComplete, setShowComplete] = useState(false)
  const [showExitConfirm, setShowExitConfirm] = useState(false)

  const resultsList = Array.from(results.values())
  const passCount = resultsList.filter(r => r === 'pass').length
  const failCount = resultsList.filter(r => r === 'fail').length
  const answeredCount = results.size

  const progress = cards.length > 0 ? (answeredCount / cards.length) * 100 : 0
  const currentCard: DBCard | undefined = cards[currentIndex]

  const hasPlayedStartRef = useRef(false)
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
  }, [])

  useEffect(() => {
    hasPlayedStartRef.current = false
    snapshotRef.current = null
  }, [sessionKey])

  useEffect(() => {
    if (cards.length > 0 && currentCard && !showComplete && !hasPlayedStartRef.current) {
      hasPlayedStartRef.current = true
      playReviewStart()
    }
  }, [cards.length, currentCard, showComplete, sessionKey])

  const handleFlip = useCallback(() => {
    playCardFlip()
    setIsFlipped(true)
  }, [])

  const handleResult = useCallback((result: 'pass' | 'fail') => {
    if (!currentCard) return
    if (result === 'pass') playSuccessPing()
    else playFail()
    setResults(prev => {
      const next = new Map(prev)
      next.set(currentCard.id, result)
      return next
    })
    setIsFlipped(false)
    if (currentIndex + 1 >= cards.length) {
      setShowComplete(true)
    } else {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
      advanceTimerRef.current = setTimeout(() => {
        setCurrentIndex(prev => prev + 1)
      }, 200)
    }
  }, [currentCard, currentIndex, cards.length])

  const goPrev = useCallback(() => {
    if (currentIndex <= 0) return
    setCurrentIndex(prev => prev - 1)
    const prevCard = cards[currentIndex - 1]
    setIsFlipped(!!prevCard && results.has(prevCard.id))
  }, [currentIndex, cards, results])

  const handleBackFromStudy = useCallback(() => {
    if (results.size === 0 || showComplete) {
      goBack()
      return
    }
    setShowExitConfirm(true)
  }, [results.size, showComplete, goBack])

  const handleRestart = useCallback(() => {
    snapshotRef.current = null
    setCurrentIndex(0)
    setIsFlipped(false)
    setResults(new Map())
    setShowComplete(false)
    setShowExitConfirm(false)
    setSessionKey(k => k + 1)
  }, [])

  if (!stack || cards.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="text-muted-foreground text-sm">
          {!stack ? '스택을 불러오는 중...' : '이 스택에 카드가 없습니다.'}
        </p>
        <button
          onClick={goBack}
          className="rounded-2xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground"
        >
          돌아가기
        </button>
      </div>
    )
  }

  if (showExitConfirm) {
    return (
      <div className="flex flex-col min-h-screen">
        <ScreenHeader title="학습" showBack />
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
          <p className="text-center text-sm text-foreground">
            학습을 중단하고 나갈까요?<br />
            <span className="text-xs text-muted-foreground">진행 기록은 저장되지 않습니다.</span>
          </p>
          <div className="flex w-full max-w-xs gap-3">
            <button
              onClick={() => setShowExitConfirm(false)}
              className="flex-1 rounded-2xl bg-muted py-3.5 text-sm font-bold text-foreground"
            >
              계속하기
            </button>
            <button
              onClick={goBack}
              className="flex-1 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground"
            >
              나가기
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (showComplete) {
    return (
      <div className="flex flex-col min-h-screen pb-20">
        <ScreenHeader title="학습 완료" showBack onBack={goBack} />
        <div className="flex flex-1 flex-col items-center gap-6 px-4 pt-6">
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className="flex w-full flex-col items-center gap-4 rounded-2xl bg-card p-6 shadow-sm"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15">
              <Check className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-lg font-bold text-foreground">학습을 마쳤어요!</h2>
            <p className="text-sm text-muted-foreground text-center">
              {category?.name} · {cards.length}장
            </p>
            <p className="text-xs text-muted-foreground text-center">
              자유 학습은 단계에 영향을 주지 않습니다.
            </p>

            <div className="flex gap-6">
              <div className="flex flex-col items-center">
                <span className="text-xl font-bold text-success">{passCount}</span>
                <span className="text-xs text-muted-foreground">맞음</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-xl font-bold text-destructive">{failCount}</span>
                <span className="text-xs text-muted-foreground">틀림</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-xl font-bold text-muted-foreground">{cards.length - answeredCount}</span>
                <span className="text-xs text-muted-foreground">미응답</span>
              </div>
            </div>

            <div className="flex w-full flex-col gap-2">
              <button
                onClick={handleRestart}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground"
              >
                <RotateCcw className="h-4 w-4" />
                다시 학습
              </button>
              <button
                onClick={goBack}
                className="w-full rounded-xl bg-muted py-3.5 text-sm font-bold text-foreground"
              >
                목록으로
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    )
  }

  if (!currentCard) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="text-muted-foreground text-sm">로딩 중...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen">
      <div className="fixed left-0 right-0 top-0 z-50 bg-background/95 backdrop-blur-md">
        <ScreenHeader
          title={`학습 (${currentIndex + 1}/${cards.length})`}
          showBack
          onBack={handleBackFromStudy}
        />
      </div>
      <div className="flex flex-1 flex-col gap-4 px-4 pt-2 pb-8 min-h-screen" style={{ paddingTop: '5.5rem' }}>
        <p className="text-center text-[11px] text-muted-foreground">
          자유 학습 · 단계 승급 없음
        </p>
        <Progress value={progress} className="h-2 rounded-full" />

        <div className="flex flex-1 flex-col gap-4 min-h-0">
          <div className="rounded-2xl bg-card p-5 shadow-md border border-border/50">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              앞면 (문제)
            </p>
            <p className="text-lg font-bold text-foreground leading-relaxed whitespace-pre-wrap">
              {currentCard.front}
            </p>
          </div>

          {isFlipped && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl bg-primary/5 border border-primary/20 p-5"
            >
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary/80">
                뒷면 (정답)
              </p>
              <p className="text-lg font-semibold text-foreground leading-relaxed whitespace-pre-wrap">
                {currentCard.back}
              </p>
            </motion.div>
          )}

          {!isFlipped && (
            <div className="flex justify-center pt-2">
              <button
                onClick={handleFlip}
                className="rounded-2xl bg-primary/15 px-6 py-3 text-sm font-bold text-primary"
              >
                정답 보기
              </button>
            </div>
          )}

          {isFlipped && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-3 pt-2"
            >
              <div className="flex gap-3">
                <button
                  onClick={() => handleResult('fail')}
                  className={`flex-1 rounded-2xl py-3.5 text-sm font-bold flex items-center justify-center gap-2 transition-transform active:scale-[0.98] ${
                    results.get(currentCard.id) === 'fail'
                      ? 'bg-destructive/20 text-destructive ring-2 ring-destructive/50'
                      : 'bg-destructive/10 text-destructive'
                  }`}
                >
                  <X className="h-5 w-5" />
                  틀렸어요
                </button>
                <button
                  onClick={() => handleResult('pass')}
                  className={`flex-1 rounded-2xl py-3.5 text-sm font-bold flex items-center justify-center gap-2 transition-transform active:scale-[0.98] ${
                    results.get(currentCard.id) === 'pass'
                      ? 'bg-success/20 text-success ring-2 ring-success/50'
                      : 'bg-success/10 text-success'
                  }`}
                >
                  <Check className="h-5 w-5" />
                  맞았어요
                </button>
              </div>
              <div className="flex justify-start">
                <button
                  onClick={goPrev}
                  disabled={currentIndex === 0}
                  className="flex items-center gap-1 rounded-xl bg-muted px-4 py-2.5 text-sm font-semibold text-foreground disabled:opacity-40 disabled:pointer-events-none"
                >
                  <ChevronLeft className="h-4 w-4" />
                  이전
                </button>
              </div>
            </motion.div>
          )}
        </div>

        <div className="flex flex-wrap justify-center gap-1.5">
          {cards.map((card, i) => {
            const r = results.get(card.id)
            return (
              <div
                key={card.id}
                className={`h-2 w-2 rounded-full transition-colors ${
                  i === currentIndex
                    ? 'bg-primary ring-2 ring-primary/40 ring-offset-2 ring-offset-background'
                    : r === 'pass'
                      ? 'bg-success'
                      : r === 'fail'
                        ? 'bg-destructive'
                        : 'bg-muted'
                }`}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
