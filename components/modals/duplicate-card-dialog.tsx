'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import type { DuplicateMatch } from '@/lib/card-lookup'

export interface DuplicateDialogRequest {
  front: string
  back: string
  matches: DuplicateMatch[]
  progress?: { current: number; total: number }
  isBulk?: boolean
}

interface DuplicateCardDialogProps {
  request: DuplicateDialogRequest | null
  onDecision: (decision: 'add' | 'skip') => void
}

function CardCompareBlock({
  label,
  front,
  back,
  highlight,
}: {
  label: string
  front: string
  back: string
  highlight?: 'new' | 'existing'
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        highlight === 'new'
          ? 'border-primary/40 bg-primary/5'
          : highlight === 'existing'
            ? 'border-border bg-muted/50'
            : 'border-border bg-card'
      }`}
    >
      <p className="mb-2 text-[11px] font-semibold text-muted-foreground">{label}</p>
      <div className="space-y-2">
        <div>
          <p className="text-[10px] font-medium text-muted-foreground/80">앞면</p>
          <p className="text-sm font-semibold text-foreground whitespace-pre-line">{front}</p>
        </div>
        <div>
          <p className="text-[10px] font-medium text-muted-foreground/80">뒷면</p>
          <p className="text-sm text-foreground whitespace-pre-line">{back}</p>
        </div>
      </div>
    </div>
  )
}

export function DuplicateCardDialog({ request, onDecision }: DuplicateCardDialogProps) {
  return (
    <AnimatePresence>
      {request && (
        <>
          <motion.div
            key="dup-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm"
            onClick={() => onDecision('skip')}
          />
          <motion.div
            key="dup-modal"
            initial={{ opacity: 0, y: 80 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 80 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="fixed bottom-0 left-0 right-0 z-[70] mx-auto max-w-md rounded-t-3xl bg-card p-6 shadow-xl max-h-[85vh] overflow-y-auto"
          >
            {request.progress && (
              <p className="mb-2 text-center text-xs font-semibold text-muted-foreground">
                {request.progress.current} / {request.progress.total}
              </p>
            )}

            <div className="mb-4 flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
              <div>
                <h2 className="text-lg font-bold text-foreground">앞면이 같은 카드가 있습니다</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  기존 {request.matches.length}개와 앞면이 같습니다. 뒷면을 비교한 뒤 추가할지 선택하세요.
                </p>
              </div>
            </div>

            <div className="mb-4 flex flex-col gap-2">
              <CardCompareBlock
                label="새로 추가할 카드"
                front={request.front}
                back={request.back}
                highlight="new"
              />

              {request.matches.map((match, i) => (
                <CardCompareBlock
                  key={match.isPendingBatch ? `batch-${i}` : match.card.id}
                  label={
                    match.isPendingBatch
                      ? `이번에 추가 예정 (${i + 1})`
                      : `기존 카드 · ${match.locationLabel}`
                  }
                  front={match.card.front}
                  back={match.card.back}
                  highlight="existing"
                />
              ))}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onDecision('skip')}
                className="flex-1 rounded-2xl bg-muted py-3.5 text-sm font-bold text-foreground"
              >
                {request.isBulk ? '건너뛰기' : '취소'}
              </button>
              <button
                type="button"
                onClick={() => onDecision('add')}
                className="flex-1 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground"
              >
                그래도 추가
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
