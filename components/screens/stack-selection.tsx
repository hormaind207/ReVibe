'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ChevronRight, Calendar, GraduationCap, Plus, Trash2, Pencil, MoreVertical } from 'lucide-react'
import { useNavigation } from '@/lib/store'
import { useStacksByStage, useGraduatedStacks, createStack, deleteStack, updateStack } from '@/lib/hooks/use-stacks'
import { useCategory } from '@/lib/hooks/use-categories'
import { useCardCount, useGraduatedCards, deleteCard } from '@/lib/hooks/use-cards'
import { db } from '@/lib/db'
import { uploadToGDrive } from '@/lib/sync'
import { STAGES } from '@/lib/types'
import { ScreenHeader } from '@/components/screen-header'
import { today } from '@/lib/db'
import type { DBStack, DBCard } from '@/lib/db'

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
}

function getStackDisplayName(stack: DBStack): string {
  if (stack.name?.trim()) return stack.name.trim()
  const dateStr = stack.createdAt ? new Date(stack.createdAt).toISOString().slice(0, 10) : stack.nextReviewDate
  return `${formatDate(dateStr)} 스택`
}

async function deleteGraduatedCard(card: DBCard): Promise<void> {
  await deleteCard(card.id)
  const remaining = await db.cards.where('stackId').equals(card.stackId).count()
  if (remaining === 0) {
    await db.stacks.delete(card.stackId)
    await uploadToGDrive().catch(() => {})
  }
}

function GraduatedCardRow({
  card,
  onDeleteConfirm,
}: {
  card: DBCard
  onDeleteConfirm: (card: DBCard) => void
}) {
  const [showMenu, setShowMenu] = useState(false)

  return (
    <motion.div
      variants={itemVariants}
      className="relative flex items-center gap-2 rounded-2xl bg-card px-4 py-3 shadow-sm"
    >
      <div className="flex flex-1 min-w-0 flex-col">
        <p className="text-sm font-bold text-foreground whitespace-pre-line line-clamp-2">{card.front}</p>
        <p className="mt-1 text-xs text-muted-foreground whitespace-pre-line line-clamp-1">{card.back}</p>
      </div>
      <div className="relative flex-shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); setShowMenu(v => !v) }}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/80 text-muted-foreground hover:bg-muted"
          aria-label="메뉴"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {showMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
            <div className="absolute right-0 top-10 z-50 min-w-[100px] rounded-xl bg-card p-1 shadow-xl border border-border">
              <button
                onClick={() => { onDeleteConfirm(card); setShowMenu(false) }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" /> 삭제
              </button>
            </div>
          </>
        )}
      </div>
    </motion.div>
  )
}

function StackRow({
  stack,
  categoryId,
  editMode,
  selected,
  onToggleSelect,
  onNavigate,
}: {
  stack: DBStack
  categoryId: string
  editMode: boolean
  selected: boolean
  onToggleSelect: (id: string) => void
  onNavigate: () => void
}) {
  const cardCount = useCardCount(stack.id) ?? 0
  const t = today()
  const isDue = stack.nextReviewDate <= t
  const displayName = getStackDisplayName(stack)

  if (editMode) {
    return (
      <motion.div variants={itemVariants} className="relative flex items-center gap-2">
        <button
          onClick={() => onToggleSelect(stack.id)}
          className={`flex flex-1 items-center gap-4 rounded-2xl px-5 py-4 shadow-sm text-left border-2 focus:outline-none focus:ring-0 ${
            selected ? 'border-primary bg-primary/10' : 'border-transparent bg-card'
          }`}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-muted-foreground/30">
            {selected ? (
              <div className="h-5 w-5 rounded-full bg-primary" />
            ) : (
              <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/50" />
            )}
          </div>
          <div className="flex flex-1 flex-col items-start min-w-0">
            <span className="text-sm font-bold text-foreground">{displayName}</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground">{cardCount}장</span>
              {isDue && (
                <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                  복습 필요
                </span>
              )}
            </div>
          </div>
        </button>
      </motion.div>
    )
  }

  return (
    <motion.div variants={itemVariants} className="relative flex items-center gap-2">
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={onNavigate}
        className="flex flex-1 items-center gap-4 rounded-2xl bg-card px-5 py-4 shadow-sm text-left"
      >
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isDue ? 'bg-destructive/20' : 'bg-primary/20'}`}>
          <Calendar className={`h-5 w-5 ${isDue ? 'text-destructive' : 'text-primary'}`} />
        </div>
        <div className="flex flex-1 flex-col items-start min-w-0">
          <span className="text-sm font-bold text-foreground">{displayName}</span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground">{cardCount}장</span>
            {isDue && (
              <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                복습 필요
              </span>
            )}
            {!isDue && (
              <span className="text-xs text-muted-foreground">
                복습일: {formatDate(stack.scheduledReviewDate ?? stack.nextReviewDate)}
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
      </motion.button>
    </motion.div>
  )
}

interface StackSelectionProps {
  categoryId: string
  stage: number
}

type GraduatedSort = 'createdDesc' | 'createdAsc' | 'reviewedDesc' | 'reviewedAsc'

// stage === 99 means "graduated" view
export function StackSelection({ categoryId, stage }: StackSelectionProps) {
  const { navigate } = useNavigation()
  const isGraduatedView = stage === 99
  const regularStacks = useStacksByStage(categoryId, isGraduatedView ? -1 : stage) ?? []
  const graduatedStacks = useGraduatedStacks(categoryId) ?? []
  const graduatedCards = useGraduatedCards(categoryId) ?? []
  const stacks = isGraduatedView ? graduatedStacks : regularStacks
  const category = useCategory(categoryId)
  const stageInfo = STAGES.find(s => s.stage === stage)
  const stageLabel = (category?.stageLabels?.[stage]) ?? stageInfo?.interval ?? `단계 ${stage}`
  const [devMode, setDevMode] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [graduatedSort, setGraduatedSort] = useState<GraduatedSort>('reviewedDesc')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [renameStackId, setRenameStackId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [graduatedCardToDelete, setGraduatedCardToDelete] = useState<DBCard | null>(null)

  useEffect(() => {
    setDevMode(localStorage.getItem('dev_mode') === 'true')
  }, [])

  if (!isGraduatedView && !stageInfo) return null

  const title = isGraduatedView ? '졸업' : `단계 ${stage}: ${stageLabel}`
  const selectedCount = selectedIds.size
  const canRename = selectedCount === 1

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBulkDelete = async () => {
    for (const id of selectedIds) await deleteStack(id)
    setSelectedIds(new Set())
    setShowDeleteConfirm(false)
    setEditMode(false)
  }

  const openRename = () => {
    if (selectedIds.size !== 1) return
    const id = [...selectedIds][0]
    const s = stacks.find(st => st.id === id)
    setRenameStackId(id)
    setRenameValue(s ? (s.name?.trim() ?? '') : '')
  }

  const handleRenameSave = async () => {
    if (!renameStackId || !renameValue.trim()) {
      setRenameStackId(null)
      return
    }
    await updateStack(renameStackId, { name: renameValue.trim() })
    setRenameStackId(null)
    setRenameValue('')
    setSelectedIds(new Set())
    setEditMode(false)
  }

  const handleCreateStack = async () => {
    const newStack = await createStack(categoryId, stage)
    navigate({ type: 'stack', categoryId, stackId: newStack.id })
  }

  const handleDeleteGraduatedCard = async () => {
    if (!graduatedCardToDelete) return
    await deleteGraduatedCard(graduatedCardToDelete)
    setGraduatedCardToDelete(null)
  }

  return (
    <div className="flex flex-col pb-20">
      <ScreenHeader
        title={title}
        showBack
        rightElement={
          !isGraduatedView ? (
            editMode ? (
              <button
                onClick={() => { setEditMode(false); setSelectedIds(new Set()) }}
                className="rounded-xl bg-muted px-3 py-1.5 text-sm font-semibold text-foreground"
              >
                완료
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setEditMode(true)}
                  className="rounded-xl bg-muted px-3 py-1.5 text-sm font-semibold text-foreground"
                >
                  편집
                </button>
                {devMode && (
                  <button
                    onClick={handleCreateStack}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary"
                    aria-label="새 스택 추가"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                )}
              </div>
            )
          ) : undefined
        }
      />

      <div className="px-4">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-foreground">
            {category?.name ?? ''} {isGraduatedView ? '졸업 카드' : '스택 목록'}
          </h2>
          {isGraduatedView && graduatedCards.length > 0 && (
            <select
              value={graduatedSort}
              onChange={(e) => setGraduatedSort(e.target.value as GraduatedSort)}
              className="rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground"
            >
              <option value="reviewedDesc">최근 졸업한 순</option>
              <option value="reviewedAsc">오래 전에 졸업한 순</option>
              <option value="createdDesc">최근 추가한 순</option>
              <option value="createdAsc">오래 전에 추가한 순</option>
            </select>
          )}
        </div>

        {isGraduatedView && graduatedCards.length > 0 ? (
          <>
            {graduatedCardToDelete && (
              <div className="mb-4 rounded-2xl bg-destructive/10 p-4">
                <p className="mb-1 text-sm font-semibold text-destructive">이 졸업 카드를 삭제할까요?</p>
                <p className="mb-3 text-xs text-muted-foreground whitespace-pre-line line-clamp-2">"{graduatedCardToDelete.front}"</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setGraduatedCardToDelete(null)}
                    className="flex-1 rounded-xl bg-muted py-2.5 text-sm font-medium"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleDeleteGraduatedCard}
                    className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-bold text-white"
                  >
                    삭제
                  </button>
                </div>
              </div>
            )}
            <motion.div
              className="flex flex-col gap-2"
              variants={containerVariants}
              initial="hidden"
              animate="show"
            >
              {[...graduatedCards]
                .sort((a, b) => {
                  if (graduatedSort === 'createdDesc') return b.createdAt - a.createdAt
                  if (graduatedSort === 'createdAsc') return a.createdAt - b.createdAt
                  if (graduatedSort === 'reviewedDesc') return (b.lastReviewed ?? 0) - (a.lastReviewed ?? 0)
                  return (a.lastReviewed ?? 0) - (b.lastReviewed ?? 0)
                })
                .map((card) => (
                  <GraduatedCardRow
                    key={card.id}
                    card={card}
                    onDeleteConfirm={setGraduatedCardToDelete}
                  />
                ))}
            </motion.div>
          </>
        ) : isGraduatedView ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-card p-8 text-center shadow-sm">
            <GraduationCap className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm font-medium text-muted-foreground">아직 졸업한 카드가 없습니다.</p>
            <p className="text-xs text-muted-foreground/70">모든 단계를 통과한 카드가 여기에 표시됩니다.</p>
          </div>
        ) : stacks.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-card p-8 text-center shadow-sm">
            <Calendar className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm font-medium text-muted-foreground">이 단계에 스택이 없습니다.</p>
            <p className="text-xs text-muted-foreground/70">홈 화면에서 카드를 추가하면 스택이 자동으로 생성됩니다.</p>
          </div>
        ) : (
          <>
            {showDeleteConfirm && (
              <div className="mb-4 rounded-2xl bg-destructive/10 p-4">
                <p className="mb-3 text-sm font-semibold text-destructive">
                  선택한 {selectedCount}개 스택과 모든 카드를 삭제할까요?
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 rounded-xl bg-muted py-2.5 text-sm font-medium">취소</button>
                  <button onClick={handleBulkDelete} className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-bold text-white">삭제</button>
                </div>
              </div>
            )}
            {renameStackId && (
              <div className="mb-4 rounded-2xl bg-card border border-border p-4 shadow-sm">
                <p className="mb-2 text-sm font-semibold text-foreground">스택 이름 변경</p>
                <input
                  type="text"
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  placeholder="이름 입력"
                  className="mb-3 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <div className="flex gap-2">
                  <button onClick={() => { setRenameStackId(null); setRenameValue('') }} className="flex-1 rounded-xl bg-muted py-2.5 text-sm font-medium">취소</button>
                  <button onClick={handleRenameSave} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground">저장</button>
                </div>
              </div>
            )}
            <motion.div
              className="flex flex-col gap-3"
              variants={containerVariants}
              initial="hidden"
              animate="show"
            >
              {stacks.map((stack) => (
                <StackRow
                  key={stack.id}
                  stack={stack}
                  categoryId={categoryId}
                  editMode={editMode}
                  selected={selectedIds.has(stack.id)}
                  onToggleSelect={toggleSelect}
                  onNavigate={() => navigate({ type: 'stack', categoryId, stackId: stack.id })}
                />
              ))}
            </motion.div>
            {editMode && (
              <div className="fixed bottom-20 left-0 right-0 z-40 flex gap-2 px-4 pb-2 pt-3 bg-background/95 backdrop-blur border-t border-border">
                <button
                  onClick={() => selectedCount >= 1 && setShowDeleteConfirm(true)}
                  disabled={selectedCount === 0}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-destructive/90 py-3 text-sm font-bold text-white disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" /> 삭제 {selectedCount > 0 ? `(${selectedCount})` : ''}
                </button>
                <button
                  onClick={openRename}
                  disabled={!canRename}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-40"
                >
                  <Pencil className="h-4 w-4" /> 이름 변경
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
