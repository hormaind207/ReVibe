'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { X, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { useNavigation } from '@/lib/store'
import { useStack, deleteStack } from '@/lib/hooks/use-stacks'
import { useCards } from '@/lib/hooks/use-cards'
import { useCategory } from '@/lib/hooks/use-categories'
import { processReviewResult, applyPartialReviewResult, getTodayReviewStacks, DEFAULT_MAX_STAGES } from '@/lib/leitner'
import { updateStreakOnDaySuccess } from '@/lib/streak'
import { ScreenHeader } from '@/components/screen-header'
import { Progress } from '@/components/ui/progress'
import { ConfettiExplosion } from '@/components/confetti'
import { playReviewStart, playSuccessPing, playFail, playCardFlip, playMasterFanfare } from '@/lib/sounds'
import type { DBCard } from '@/lib/db'

interface ReviewSessionProps {
  categoryId: string
  stackId: string
}

type ReviewResult = { promoted: boolean; demotedCount: number; completedStack: boolean; stackEmpty?: boolean; autoDeleted?: boolean }

export function ReviewSession({ categoryId, stackId }: ReviewSessionProps) {
  const { goBack, navigateToStageReplacingStackFlow } = useNavigation()
  const stack = useStack(stackId)
  const cards = useCards(stackId) ?? []
  const category = useCategory(categoryId)

  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [results, setResults] = useState<Map<string, 'pass' | 'fail'>>(new Map())
  const [showComplete, setShowComplete] = useState(false)
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null)
  const [processing, setProcessing] = useState(false)
  const [showEmptyStackConfirm, setShowEmptyStackConfirm] = useState(false)
  const [showSaveProgressConfirm, setShowSaveProgressConfirm] = useState(false)

  const resultsList = Array.from(results.values())
  const passCount = resultsList.filter(r => r === 'pass').length
  const failCount = resultsList.filter(r => r === 'fail').length
  const answeredCount = results.size

  const progress = cards.length > 0 ? (answeredCount / cards.length) * 100 : 0
  const currentCard: DBCard | undefined = cards[currentIndex]
  const isFinished = currentIndex >= cards.length
  const maxStages = category?.maxStages ?? DEFAULT_MAX_STAGES

  const hasPlayedStartRef = useRef(false)
  const hasPlayedFanfareRef = useRef(false)

  useEffect(() => {
    if (cards.length > 0 && currentCard && !showComplete && !hasPlayedStartRef.current) {
      hasPlayedStartRef.current = true
      playReviewStart()
    }
  }, [cards.length, currentCard, showComplete])

  useEffect(() => {
    if (showComplete && stack && stack.stage >= maxStages && passCount > 0 && !hasPlayedFanfareRef.current) {
      hasPlayedFanfareRef.current = true
      playMasterFanfare()
    }
  }, [showComplete, stack?.stage, maxStages, passCount])

  const handleFlip = useCallback(() => {
    playCardFlip()
    setIsFlipped(true)
  }, [])

  const goNext = useCallback(() => {
    if (currentIndex + 1 >= cards.length) {
      setShowComplete(true)
    } else {
      setCurrentIndex(prev => prev + 1)
      setIsFlipped(false)
    }
  }, [currentIndex, cards.length])

  const handleResult = useCallback((result: 'pass' | 'fail') => {
    if (!currentCard) return
    if (result === 'pass') playSuccessPing()
    else playFail()
    const newResults = new Map(results)
    newResults.set(currentCard.id, result)
    setResults(newResults)
    setIsFlipped(false)
    if (currentIndex + 1 >= cards.length) {
      setShowComplete(true)
    } else {
      setTimeout(() => {
        setCurrentIndex(prev => prev + 1)
      }, 200)
    }
  }, [currentCard, results, currentIndex, cards.length])

  const goPrev = useCallback(() => {
    if (currentIndex <= 0) return
    setCurrentIndex(prev => prev - 1)
    const prevCard = cards[currentIndex - 1]
    setIsFlipped(!!prevCard && results.has(prevCard.id))
  }, [currentIndex, cards, results])

  const handleFinish = useCallback(async () => {
    setProcessing(true)
    try {
      const outcome = await processReviewResult(stackId, results)
      setReviewResult(outcome)
      getTodayReviewStacks().then((dueStacks) => {
        if (dueStacks.length === 0) updateStreakOnDaySuccess().catch(() => {})
      })
      if (outcome.autoDeleted) {
        navigateToStageReplacingStackFlow(categoryId, stack!.stage)
        return
      }
      if (outcome.stackEmpty) {
        setShowEmptyStackConfirm(true)
      } else if (outcome.completedStack) {
        navigateToStageReplacingStackFlow(categoryId, maxStages)
      } else {
        goBack()
      }
    } catch (e) {
      console.error(e)
    } finally {
      setProcessing(false)
    }
  }, [stackId, results, goBack, navigateToStageReplacingStackFlow, categoryId, stack?.stage, maxStages])

  const handleRemoveEmptyStack = useCallback(() => {
    setShowEmptyStackConfirm(false)
    const stage = stack?.stage ?? 1
    deleteStack(stackId).then(() => {
      navigateToStageReplacingStackFlow(categoryId, stage)
    })
  }, [stackId, categoryId, navigateToStageReplacingStackFlow, stack?.stage])

  const handleKeepEmptyStack = useCallback(() => {
    setShowEmptyStackConfirm(false)
    navigateToStageReplacingStackFlow(categoryId, stack?.stage ?? 1)
  }, [navigateToStageReplacingStackFlow, categoryId, stack?.stage])

  const handleBackFromReview = useCallback(() => {
    if (results.size === 0) {
      goBack()
      return
    }
    setShowSaveProgressConfirm(true)
  }, [results.size, goBack])

  const handleSaveProgressYes = useCallback(async () => {
    setShowSaveProgressConfirm(false)
    setProcessing(true)
    try {
      const { categoryId: cid, stage } = await applyPartialReviewResult(stackId, results)
      navigateToStageReplacingStackFlow(cid, stage)
    } catch (e) {
      console.error(e)
    } finally {
      setProcessing(false)
    }
  }, [stackId, results, navigateToStageReplacingStackFlow])

  const handleSaveProgressNo = useCallback(() => {
    setShowSaveProgressConfirm(false)
    goBack()
  }, [goBack])

  if (!stack || (cards.length === 0 && !processing && !showComplete)) {
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

  // Empty stack confirmation (all cards failed)
  if (showEmptyStackConfirm) {
    return (
      <div className="flex flex-col min-h-screen">
        <ScreenHeader title="스택 비우기" showBack />
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
          <p className="text-center text-sm text-foreground">
            이 스택의 카드가 모두 단계 1로 이동했어요.<br />빈 스택을 없앨까요?
          </p>
          <div className="flex w-full max-w-xs gap-3">
            <button
              onClick={handleKeepEmptyStack}
              className="flex-1 rounded-2xl bg-muted py-3.5 text-sm font-bold text-foreground"
            >
              남기기
            </button>
            <button
              onClick={handleRemoveEmptyStack}
              className="flex-1 rounded-2xl bg-destructive py-3.5 text-sm font-bold text-white"
            >
              없애기
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Save progress confirmation (mid-review exit)
  if (showSaveProgressConfirm) {
    return (
      <div className="flex flex-col min-h-screen">
        <ScreenHeader title="복습" showBack />
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
          <p className="text-center text-sm text-foreground">진행상황을 저장할까요?</p>
          <div className="flex w-full max-w-xs gap-3">
            <button
              onClick={handleSaveProgressNo}
              className="flex-1 rounded-2xl bg-muted py-3.5 text-sm font-bold text-foreground"
            >
              아니오
            </button>
            <button
              onClick={handleSaveProgressYes}
              disabled={processing}
              className="flex-1 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              예
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Completion screen — apply results when user clicks "완료"
  if (showComplete) {
    const allPassed = failCount === 0
    const newStage = stack && (stack.stage < maxStages ? stack.stage + 1 : maxStages)
    const showGraduationCongrats = stack && stack.stage >= maxStages && passCount > 0

    return (
      <div className="flex flex-col min-h-screen pb-20">
        <ScreenHeader title="복습 완료" showBack />
        <div className="flex flex-1 flex-col items-center gap-6 px-4 pt-6">
          {allPassed && <ConfettiExplosion />}
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className="flex w-full flex-col items-center gap-4 rounded-2xl bg-card p-6 shadow-sm"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/20">
              <Check className="h-8 w-8 text-success" />
            </div>
            <h2 className="text-lg font-bold text-foreground">수고했어요!</h2>
            {showGraduationCongrats && (
              <p className="text-center text-sm font-semibold text-primary">졸업을 축하해요!</p>
            )}
            <p className="text-sm text-muted-foreground text-center">
              {category?.name} · {cards.length}장 복습
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
            </div>

            {failCount === cards.length ? (
              <p className="text-center text-xs text-muted-foreground">
                틀린 카드 {failCount}장이 단계 1로 이동합니다.
              </p>
            ) : allPassed ? (
              <p className="text-center text-xs font-semibold text-success">
                단계 {stack.stage} → 단계 {newStage} 승급!
              </p>
            ) : (
              <p className="text-center text-xs text-muted-foreground">
                맞은 카드는 단계 {newStage}로, 틀린 카드는 단계 1로 이동합니다.
              </p>
            )}

            <button
              onClick={handleFinish}
              disabled={processing}
              className="w-full rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {processing ? '처리 중...' : '완료'}
            </button>
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
      {/* Fixed header so back button is always visible (e.g. when only front is shown) */}
      <div className="fixed left-0 right-0 top-0 z-50 bg-background/95 backdrop-blur-md">
        <ScreenHeader title={`복습 (${currentIndex + 1}/${cards.length})`} showBack onBack={handleBackFromReview} />
      </div>
      <div className="flex flex-1 flex-col gap-4 px-4 pt-2 pb-8 min-h-screen" style={{ paddingTop: '5.5rem' }}>
        <Progress value={progress} className="h-2 rounded-full" />

        {/* Card: front always visible, back below when revealed */}
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

        {/* Dot indicators */}
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
