'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Lock, Check, Trophy, Sparkles, Plus, Trash2, Pencil, MoreVertical, ArrowRight, Calendar } from 'lucide-react'
import { useNavigation } from '@/lib/store'
import { useStack, deleteStack, moveStackToStage, moveCardToStack } from '@/lib/hooks/use-stacks'
import { useCategory } from '@/lib/hooks/use-categories'
import { useCategories } from '@/lib/hooks/use-categories'
import { useCards, updateCard, deleteCard } from '@/lib/hooks/use-cards'
import { useStacksByStage } from '@/lib/hooks/use-stacks'
import { STAGES } from '@/lib/types'
import { DEFAULT_MAX_STAGES, STAGE_INTERVALS } from '@/lib/leitner'
import { ScreenHeader } from '@/components/screen-header'
import { AddCardModal } from '@/components/modals/add-card-modal'
import { BulkImportModal } from '@/components/modals/bulk-import-modal'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, today } from '@/lib/db'
import { uploadToGDrive } from '@/lib/sync'
import type { DBCard, DBCategory, DBStack } from '@/lib/db'

const STAGE_BG_COLORS = [
  '#e8d5f5', '#d4edda', '#d6eaf8', '#fce4b8', '#fdb99b', '#f4a7bb', '#d4a89a',
]
const STAGE_BORDER_COLORS = [
  '#c9a8e8', '#a3d4a8', '#a8cde8', '#e8c88a', '#e89b73', '#e88aa5', '#c49080',
]
const PATH_OFFSETS = [0, 1, 2, 1, 0, -1, -1, 0]

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
}

function getStackDisplayName(stack: DBStack): string {
  if (stack.name?.trim()) return stack.name.trim()
  const dateStr = stack.createdAt ? new Date(stack.createdAt).toISOString().slice(0, 10) : stack.nextReviewDate
  const d = new Date(dateStr + 'T00:00:00')
  const formatted = d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
  return `${formatted} 스택`
}

function CardMoveModal({
  card,
  currentStackId,
  onClose,
}: {
  card: DBCard
  currentStackId: string
  onClose: () => void
}) {
  const allCategories = useCategories() ?? []
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(card.categoryId)
  const stacks = (useLiveQuery(
    () => selectedCategoryId
      ? db.stacks.where('categoryId').equals(selectedCategoryId).filter(s => !s.isCompleted && s.id !== currentStackId).toArray()
      : Promise.resolve([] as DBStack[]),
    [selectedCategoryId, currentStackId]
  ) ?? []) as DBStack[]

  const selectedCategory = allCategories.find(c => c.id === selectedCategoryId)

  const handleMove = async (targetStack: DBStack) => {
    await moveCardToStack(card.id, targetStack.id, selectedCategoryId)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md mx-auto rounded-t-3xl bg-card p-5 shadow-xl max-h-[70vh] flex flex-col">
        <h3 className="mb-1 text-base font-bold text-foreground">다른 스택으로 이동</h3>
        <p className="mb-4 text-xs text-muted-foreground whitespace-pre-line line-clamp-3">"{card.front}"</p>

        <p className="mb-2 text-xs font-semibold text-muted-foreground">카테고리 선택</p>
        <div className="mb-4 flex gap-2 flex-wrap">
          {allCategories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategoryId(cat.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                selectedCategoryId === cat.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        <p className="mb-2 text-xs font-semibold text-muted-foreground">스택 선택</p>
        <div className="flex-1 overflow-y-auto flex flex-col gap-2">
          {stacks.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-4">이동 가능한 스택이 없습니다</p>
          ) : (
            stacks.map(s => (
              <button
                key={s.id}
                onClick={() => handleMove(s)}
                className="flex items-center justify-between rounded-xl bg-muted px-4 py-3 text-sm font-semibold text-foreground hover:bg-primary/10"
              >
                <span>단계 {s.stage} · {selectedCategory?.name}</span>
                <ArrowRight className="h-4 w-4 text-primary" />
              </button>
            ))
          )}
        </div>
        <button onClick={onClose} className="mt-4 w-full rounded-xl bg-muted py-2.5 text-sm font-medium text-muted-foreground">
          취소
        </button>
      </div>
    </div>
  )
}

function CardItem({
  card, index, stage,
  onEdit, onDelete, onMoveCard,
}: {
  card: DBCard; index: number; stage: number;
  onEdit: (card: DBCard) => void
  onDelete: (id: string) => void
  onMoveCard: (card: DBCard) => void
}) {
  const [showActions, setShowActions] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.05 + index * 0.04 }}
      className="relative flex items-center gap-3 rounded-xl bg-card px-4 py-3 shadow-sm"
    >
      <span
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold"
        style={{
          backgroundColor: STAGE_BG_COLORS[(stage - 1) % 7],
          color: STAGE_BORDER_COLORS[(stage - 1) % 7],
        }}
      >
        {index + 1}
      </span>
      <div className="flex flex-1 flex-col min-w-0">
        <span className="text-sm font-semibold text-foreground whitespace-pre-line line-clamp-2">{card.front}</span>
        <span className="text-xs text-muted-foreground whitespace-pre-line line-clamp-2">{card.back}</span>
      </div>
      <button
        onClick={() => setShowActions(v => !v)}
        className="flex-shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {showActions && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowActions(false)} />
          <div className="absolute right-4 top-2 z-50 min-w-[148px] rounded-2xl bg-card p-1 shadow-xl border border-border">
            <button
              onClick={() => { onEdit(card); setShowActions(false) }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-foreground hover:bg-muted rounded-xl"
            >
              <Pencil className="h-4 w-4" />수정
            </button>
            <button
              onClick={() => { onMoveCard(card); setShowActions(false) }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-foreground hover:bg-muted rounded-xl"
            >
              <ArrowRight className="h-4 w-4" />다른 스택으로
            </button>
            <button
              onClick={() => { onDelete(card.id); setShowActions(false) }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-xl"
            >
              <Trash2 className="h-4 w-4" />삭제
            </button>
          </div>
        </>
      )}
    </motion.div>
  )
}

interface StackDetailsProps {
  categoryId: string
  stackId: string
}

export function StackDetails({ categoryId, stackId }: StackDetailsProps) {
  const { navigate, goBack } = useNavigation()
  const stack = useStack(stackId)
  const category = useCategory(categoryId)
  const cards = useCards(stackId) ?? []
  const [showAddCard, setShowAddCard] = useState(false)
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [editingCard, setEditingCard] = useState<DBCard | null>(null)
  const [editFront, setEditFront] = useState('')
  const [editBack, setEditBack] = useState('')
  const [showStackMenu, setShowStackMenu] = useState(false)
  const [showMoveStage, setShowMoveStage] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [movingCard, setMovingCard] = useState<DBCard | null>(null)
  const [devMode, setDevMode] = useState(false)
  const [showSetDate, setShowSetDate] = useState(false)
  const [editDate, setEditDate] = useState('')

  useEffect(() => {
    const storedDevMode = localStorage.getItem('dev_mode')
    if (storedDevMode === null) {
      localStorage.setItem('dev_mode', 'false')
      setDevMode(false)
    } else {
      setDevMode(storedDevMode === 'true')
    }
  }, [])

  if (!stack) return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">로딩 중...</p>
    </div>
  )

  const maxStages = category?.maxStages ?? DEFAULT_MAX_STAGES

  function daysToLabel(days: number) {
    if (days === 1) return '매일'
    if (days < 7) return `${days}일`
    if (days === 7) return '1주'
    if (days < 30) return `${Math.round(days / 7)}주`
    if (days < 60) return '1달'
    return `${Math.round(days / 30)}달`
  }

  const allNodes = [
    ...STAGES.slice(0, maxStages).map(s => {
      // Custom label takes priority, then interval-derived label, then default stage label
      const customLabel = category?.stageLabels?.[s.stage]
      const customDays = category?.stageIntervals?.[s.stage]
      const label = customLabel ?? (customDays ? daysToLabel(customDays) : s.interval)
      return { stage: s.stage, label, isGraduated: false }
    }),
    { stage: maxStages + 1, label: '졸업', isGraduated: true },
  ]

  const handleEditCard = (card: DBCard) => {
    setEditingCard(card)
    setEditFront(card.front)
    setEditBack(card.back)
  }

  const handleSaveCard = async () => {
    if (!editingCard) return
    await updateCard(editingCard.id, { front: editFront, back: editBack })
    setEditingCard(null)
  }

  const handleDeleteCard = async (id: string) => {
    await deleteCard(id)
  }

  const handleDeleteStack = async () => {
    await deleteStack(stackId)
    goBack()
  }

  const handleMoveToStage = async (newStage: number) => {
    await moveStackToStage(stackId, newStage, maxStages)
    setShowMoveStage(false)
    setShowStackMenu(false)
  }

  const handleOpenSetDate = () => {
    setEditDate(stack?.scheduledReviewDate ?? stack?.nextReviewDate ?? today())
    setShowSetDate(true)
    setShowStackMenu(false)
  }

  const handleSaveDate = async () => {
    if (!editDate || !stack) return
    await db.stacks.update(stackId, {
      nextReviewDate: editDate,
      scheduledReviewDate: editDate,
      updatedAt: Date.now(),
    })
    await uploadToGDrive().catch(() => {})
    setShowSetDate(false)
  }

  return (
    <div className="flex flex-col pb-20">
      <ScreenHeader
        title={getStackDisplayName(stack)}
        showBack
        rightElement={
          <div className="relative">
            <button
              onClick={() => setShowStackMenu(v => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-card text-muted-foreground shadow-sm"
              aria-label="스택 관리"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
            {showStackMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => { setShowStackMenu(false); setShowMoveStage(false) }} />
                <div className="absolute right-0 top-10 z-50 min-w-[160px] rounded-2xl bg-card p-1 shadow-xl border border-border">
                  <button
                    onClick={() => setShowMoveStage(v => !v)}
                    className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
                  >
                    <span className="flex items-center gap-2">
                      <ArrowRight className="h-4 w-4" />단계 변경
                    </span>
                    <span className="text-xs text-muted-foreground">▾</span>
                  </button>
                  {showMoveStage && (
                    <div className="mx-1 mb-1 rounded-xl bg-muted/60 p-1">
                      {Array.from({ length: maxStages }, (_, i) => i + 1).map(s => (
                        <button
                          key={s}
                          onClick={() => handleMoveToStage(s)}
                          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${
                            stack.stage === s ? 'bg-primary text-primary-foreground' : 'hover:bg-card text-foreground'
                          }`}
                        >
                          {s === 1 ? '단계 1 (매일)' : `단계 ${s}`}
                          {stack.stage === s && ' ✓'}
                        </button>
                      ))}
                    </div>
                  )}
                  {devMode && (
                    <>
                      <div className="my-0.5 mx-2 h-px bg-border" />
                      <button
                        onClick={handleOpenSetDate}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
                      >
                        <Calendar className="h-4 w-4" />복습일 설정
                      </button>
                    </>
                  )}
                  <div className="my-0.5 mx-2 h-px bg-border" />
                  <button
                    onClick={() => { setShowDeleteConfirm(true); setShowStackMenu(false) }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />스택 삭제
                  </button>
                </div>
              </>
            )}
          </div>
        }
      />

      {showDeleteConfirm && (
        <div className="mx-4 mb-4 rounded-2xl bg-destructive/10 p-4">
          <p className="mb-3 text-sm font-semibold text-destructive">이 스택과 모든 카드를 삭제할까요?</p>
          <div className="flex gap-2">
            <button onClick={handleDeleteStack} className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-bold text-white">삭제</button>
            <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 rounded-xl bg-muted py-2.5 text-sm font-medium">취소</button>
          </div>
        </div>
      )}

      {showSetDate && (
        <div className="mx-4 mb-4 rounded-2xl bg-card p-4 shadow-sm border border-primary/30">
          <div className="mb-2 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <p className="text-sm font-bold text-foreground">복습일 설정 (개발자)</p>
          </div>
          <input
            type="date"
            value={editDate}
            onChange={e => setEditDate(e.target.value)}
            className="mb-3 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <div className="mb-3 flex gap-1.5 flex-wrap">
            {[-3, -2, -1, 0, 1, 3, 7].map(offset => {
              const d = new Date()
              d.setDate(d.getDate() + offset)
              const ds = d.toISOString().slice(0, 10)
              const label = offset === 0 ? '오늘' : offset < 0 ? `${-offset}일 전` : `${offset}일 후`
              return (
                <button
                  key={offset}
                  onClick={() => setEditDate(ds)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    editDate === ds ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <div className="flex gap-2">
            <button onClick={handleSaveDate} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground">저장</button>
            <button onClick={() => setShowSetDate(false)} className="flex-1 rounded-xl bg-muted py-2.5 text-sm font-medium">취소</button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-5 px-4">
        {/* Stack Info */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border-2 border-primary/30 bg-card p-4 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ backgroundColor: STAGE_BG_COLORS[(stack.stage - 1) % 7] }}
            >
              <Sparkles className="h-5 w-5" style={{ color: STAGE_BORDER_COLORS[(stack.stage - 1) % 7] }} />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-foreground">
                {category?.name ?? ''} · 단계 {stack.stage}
              </h3>
              <p className="text-xs text-muted-foreground">
                {cards.length}장 · 복습일: {formatDate(stack.scheduledReviewDate ?? stack.nextReviewDate)}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Leitner Journey */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="rounded-2xl bg-card p-5 shadow-sm"
        >
          <h2 className="mb-5 text-center text-sm font-bold text-foreground">기억 여정</h2>
          <div className="relative mx-auto" style={{ width: '280px' }}>
            <svg
              className="absolute inset-0 h-full w-full"
              style={{ width: '280px', height: `${allNodes.length * 72 + 16}px` }}
              viewBox={`0 0 280 ${allNodes.length * 72 + 16}`}
              fill="none"
            >
              {allNodes.map((_, i) => {
                if (i === allNodes.length - 1) return null
                const x1 = 100 + PATH_OFFSETS[i] * 44
                const y1 = i * 72 + 28
                const x2 = 100 + PATH_OFFSETS[i + 1] * 44
                const y2 = (i + 1) * 72 + 28
                const isPassed = stack.stage > allNodes[i].stage
                return (
                  <motion.path
                    key={`path-${i}`}
                    d={`M ${x1} ${y1} C ${x1} ${y1 + 30}, ${x2} ${y2 - 30}, ${x2} ${y2}`}
                    stroke={isPassed ? STAGE_BORDER_COLORS[i % 7] : '#e0d6f0'}
                    strokeWidth="3"
                    strokeDasharray={isPassed ? 'none' : '6 4'}
                    strokeLinecap="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ delay: 0.1 + i * 0.08, duration: 0.4 }}
                  />
                )
              })}
            </svg>
            <div className="relative" style={{ height: `${allNodes.length * 72 + 16}px` }}>
              {allNodes.map((node, i) => {
                const isPassed = stack.stage > node.stage
                const isCurrent = stack.stage === node.stage
                const isLocked = stack.stage < node.stage
                const offsetX = PATH_OFFSETS[i] * 44
                return (
                  <motion.div
                    key={node.stage}
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.15 + i * 0.08, type: 'spring', stiffness: 300, damping: 20 }}
                    className="absolute flex items-center gap-3"
                    style={{
                      top: `${i * 72}px`,
                      left: `calc(36% + ${offsetX}px)`,
                      transform: 'translateX(-50%)',
                    }}
                  >
                    <div className="relative">
                      {isCurrent && (
                        <motion.div
                          className="absolute -inset-2 rounded-full"
                          style={{ backgroundColor: STAGE_BG_COLORS[(node.stage - 1) % 7], opacity: 0.5 }}
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                        />
                      )}
                      <div
                        onClick={isCurrent && cards.length > 0 ? () => navigate({ type: 'review', categoryId, stackId }) : undefined}
                        className={`relative flex h-12 w-12 items-center justify-center rounded-full border-[3px] ${isCurrent ? 'shadow-lg' : ''} ${isCurrent && cards.length > 0 ? 'cursor-pointer active:scale-95 transition-transform' : ''}`}
                        style={{
                          backgroundColor: node.isGraduated
                            ? isPassed ? '#f0e6d3' : '#f0ebe4'
                            : isPassed || isCurrent
                              ? STAGE_BG_COLORS[(node.stage - 1) % 7]
                              : '#f0ebe4',
                          borderColor: node.isGraduated
                            ? isPassed ? '#c4a97d' : '#d6cfc5'
                            : isPassed || isCurrent
                              ? STAGE_BORDER_COLORS[(node.stage - 1) % 7]
                              : '#d6cfc5',
                        }}
                      >
                        {node.isGraduated ? (
                          <Trophy className="h-5 w-5" style={{ color: isPassed ? '#c4a97d' : '#b8b0a5' }} />
                        ) : isPassed ? (
                          <Check className="h-5 w-5" style={{ color: STAGE_BORDER_COLORS[(node.stage - 1) % 7] }} />
                        ) : isCurrent ? (
                          <Play className="h-5 w-5" style={{ color: STAGE_BORDER_COLORS[(node.stage - 1) % 7] }} />
                        ) : (
                          <Lock className="h-4 w-4" style={{ color: '#b8b0a5' }} />
                        )}
                      </div>
                      {!node.isGraduated && (
                        <div
                          className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-card"
                          style={{ backgroundColor: isPassed || isCurrent ? STAGE_BORDER_COLORS[(node.stage - 1) % 7] : '#b8b0a5' }}
                        >
                          {node.stage}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className={`whitespace-nowrap text-xs font-bold ${isLocked ? 'text-muted-foreground/50' : 'text-foreground'}`}>
                        {node.isGraduated ? '졸업' : node.label}
                      </p>
                      {isCurrent && (
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="whitespace-nowrap text-[10px] font-semibold"
                          style={{ color: STAGE_BORDER_COLORS[(node.stage - 1) % 7] }}
                        >
                          현재 단계
                        </motion.p>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        </motion.div>

        {/* Start Review */}
        <motion.button
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => navigate({ type: 'review', categoryId, stackId })}
          disabled={cards.length === 0}
          className="flex items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold text-card shadow-md transition-all active:shadow-sm disabled:opacity-50"
          style={{ backgroundColor: cards.length > 0 ? STAGE_BORDER_COLORS[(stack.stage - 1) % 7] : '#b8b0a5' }}
        >
          <Play className="h-5 w-5" />
          복습 시작
        </motion.button>

        {/* Cards Section */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">카드 목록 ({cards.length}장)</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setShowBulkImport(true)}
                className="rounded-xl bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground"
              >
                일괄 추가
              </button>
              <button
                onClick={() => setShowAddCard(true)}
                className="flex items-center gap-1 rounded-xl bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary"
              >
                <Plus className="h-3.5 w-3.5" />카드 추가
              </button>
            </div>
          </div>

          {cards.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl bg-card p-6 text-center shadow-sm">
              <p className="text-sm text-muted-foreground">카드가 없습니다.</p>
              <p className="text-xs text-muted-foreground/70">위 버튼으로 카드를 추가해 보세요!</p>
            </div>
          ) : (
            <div className="relative flex flex-col gap-2">
              {cards.map((card, i) => (
                <CardItem
                  key={card.id}
                  card={card}
                  index={i}
                  stage={stack.stage}
                  onEdit={handleEditCard}
                  onDelete={handleDeleteCard}
                  onMoveCard={(c) => setMovingCard(c)}
                />
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Edit Card Modal */}
      {editingCard && (
        <div className="fixed inset-0 z-[60] flex items-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditingCard(null)} />
          <div className="relative z-10 w-full max-w-md mx-auto rounded-t-3xl bg-card p-6 shadow-xl">
            <h3 className="mb-4 text-base font-bold text-foreground">카드 수정</h3>
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">앞면 (문제)</label>
                <textarea
                  value={editFront}
                  onChange={e => setEditFront(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  rows={2}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">뒷면 (정답)</label>
                <textarea
                  value={editBack}
                  onChange={e => setEditBack(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  rows={2}
                />
              </div>
              <div className="flex gap-2">
                <button onClick={handleSaveCard} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground">저장</button>
                <button onClick={() => setEditingCard(null)} className="flex-1 rounded-xl bg-muted py-2.5 text-sm font-medium">취소</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <AddCardModal
        open={showAddCard}
        onClose={() => setShowAddCard(false)}
        stackId={stackId}
        categoryId={categoryId}
      />
      <BulkImportModal
        open={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        stackId={stackId}
        categoryId={categoryId}
      />

      {movingCard && (
        <CardMoveModal
          card={movingCard}
          currentStackId={stackId}
          onClose={() => setMovingCard(null)}
        />
      )}
    </div>
  )
}
