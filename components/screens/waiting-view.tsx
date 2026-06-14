'use client'

import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, Plus, Trash2, Pencil, MoreVertical, ArrowUp, Clock, CheckCircle2, CheckSquare } from 'lucide-react'
import { useNavigation } from '@/lib/store'
import { useCategory } from '@/lib/hooks/use-categories'
import { useWaitingCards, deleteCard, updateCard, promoteCardsToStage1 } from '@/lib/hooks/use-cards'
import { getOrCreateWaitingStack } from '@/lib/leitner'
import { ScreenHeader } from '@/components/screen-header'
import { AddCardModal } from '@/components/modals/add-card-modal'
import type { DBCard } from '@/lib/db'

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
}

function WaitingCardRow({
  card,
  selectMode,
  selected,
  skipMotion,
  onToggleSelect,
  onEdit,
  onPromote,
  onDelete,
}: {
  card: DBCard
  selectMode: boolean
  selected: boolean
  skipMotion?: boolean
  onToggleSelect: (id: string) => void
  onEdit: (card: DBCard) => void
  onPromote: (card: DBCard) => void
  onDelete: (card: DBCard) => void
}) {
  const [showMenu, setShowMenu] = useState(false)
  const MotionRow = skipMotion ? 'div' : motion.div
  const MotionButton = skipMotion ? 'button' : motion.button
  const motionProps = skipMotion ? {} : { variants: itemVariants }

  if (selectMode) {
    return (
      <MotionButton
        {...motionProps}
        onClick={() => onToggleSelect(card.id)}
        className={`flex items-center gap-3 rounded-2xl px-4 py-3 shadow-sm text-left border-2 focus:outline-none ${
          selected ? 'border-primary bg-primary/10' : 'border-transparent bg-card'
        }`}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 border-muted-foreground/30">
          {selected ? (
            <div className="h-[18px] w-[18px] rounded-full bg-primary" />
          ) : (
            <div className="h-[18px] w-[18px] rounded-full border-2 border-muted-foreground/50" />
          )}
        </div>
        <div className="flex flex-1 min-w-0 flex-col">
          <p className="text-sm font-bold text-foreground whitespace-pre-line line-clamp-2">{card.front}</p>
          <p className="mt-1 text-xs text-muted-foreground whitespace-pre-line line-clamp-1">{card.back}</p>
        </div>
      </MotionButton>
    )
  }

  return (
    <MotionRow
      {...motionProps}
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
            <div className="absolute right-0 top-10 z-50 min-w-[140px] rounded-xl bg-card p-1 shadow-xl border border-border">
              <button
                onClick={() => { onPromote(card); setShowMenu(false) }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                <ArrowUp className="h-4 w-4" /> 승급
              </button>
              <button
                onClick={() => { onEdit(card); setShowMenu(false) }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                <Pencil className="h-4 w-4" /> 수정
              </button>
              <button
                onClick={() => { onDelete(card); setShowMenu(false) }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" /> 삭제
              </button>
            </div>
          </>
        )}
      </div>
    </MotionRow>
  )
}

interface WaitingViewProps {
  categoryId: string
}

export function WaitingView({ categoryId }: WaitingViewProps) {
  const { navigate } = useNavigation()
  const category = useCategory(categoryId)
  const cards = useWaitingCards(categoryId) ?? []
  const skipCardMotion =
    cards.length > 20 ||
    (typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showAddCard, setShowAddCard] = useState(false)
  const [addStackId, setAddStackId] = useState<string | null>(null)
  const [cardToEdit, setCardToEdit] = useState<DBCard | null>(null)
  const [editFront, setEditFront] = useState('')
  const [editBack, setEditBack] = useState('')
  const [cardToDelete, setCardToDelete] = useState<DBCard | null>(null)
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const actionBusyRef = useRef(false)

  const selectedCount = selectedIds.size

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
    setShowBulkDeleteConfirm(false)
  }

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 1800)
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleStudy = async () => {
    if (cards.length === 0) return
    const stackId = await getOrCreateWaitingStack(categoryId)
    navigate({ type: 'study', categoryId, stackId })
  }

  const handleOpenAdd = async () => {
    const stackId = await getOrCreateWaitingStack(categoryId)
    setAddStackId(stackId)
    setShowAddCard(true)
  }

  const handlePromote = async () => {
    if (selectedCount === 0 || actionBusyRef.current) return
    actionBusyRef.current = true
    try {
      const ids = [...selectedIds]
      await promoteCardsToStage1(categoryId, ids)
      exitSelectMode()
      showToast(`${ids.length}장을 1단계로 보냈습니다.`)
    } finally {
      actionBusyRef.current = false
    }
  }

  const handleBulkDelete = async () => {
    if (selectedCount === 0 || actionBusyRef.current) return
    actionBusyRef.current = true
    try {
      const count = selectedCount
      for (const id of selectedIds) await deleteCard(id)
      exitSelectMode()
      showToast(`${count}장을 삭제했습니다.`)
    } finally {
      actionBusyRef.current = false
    }
  }

  const handlePromoteSingle = async (card: DBCard) => {
    if (actionBusyRef.current) return
    actionBusyRef.current = true
    try {
      await promoteCardsToStage1(categoryId, [card.id])
      showToast('1단계로 보냈습니다.')
    } finally {
      actionBusyRef.current = false
    }
  }

  const openEdit = (card: DBCard) => {
    setCardToEdit(card)
    setEditFront(card.front)
    setEditBack(card.back)
  }

  const handleEditSave = async () => {
    if (!cardToEdit || !editFront.trim() || !editBack.trim()) return
    await updateCard(cardToEdit.id, { front: editFront.trim(), back: editBack.trim() })
    setCardToEdit(null)
  }

  const handleDelete = async () => {
    if (!cardToDelete) return
    await deleteCard(cardToDelete.id)
    setCardToDelete(null)
  }

  return (
    <div className="flex flex-col pb-24">
      <ScreenHeader title="대기" showBack />

      <div className="px-4">
        <div className="mb-3 flex items-center gap-2">
          <Clock className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-base font-bold text-foreground">
            {category?.name ?? ''} 대기 카드
          </h2>
          {cards.length > 0 && (
            <span className="text-sm font-medium text-muted-foreground">{cards.length}장</span>
          )}
        </div>

        <p className="mb-4 text-xs text-muted-foreground">
          대기 카드는 복습 일정에 들어가지 않습니다. 준비되면 1단계로 보내 복습을 시작하세요.
        </p>

        {/* 일반 모드 액션 버튼 */}
        {!selectMode && (
          <div className="mb-4 flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                onClick={handleStudy}
                disabled={cards.length === 0}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-muted py-3 text-sm font-bold text-foreground transition-transform active:scale-95 disabled:opacity-40"
              >
                <BookOpen className="h-4 w-4" /> 자유학습
              </button>
              <button
                onClick={handleOpenAdd}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground transition-transform active:scale-95"
              >
                <Plus className="h-4 w-4" /> 카드 추가
              </button>
            </div>
            {cards.length > 0 && (
              <button
                onClick={() => setSelectMode(true)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3 text-sm font-bold text-foreground transition-transform active:scale-95"
              >
                <CheckSquare className="h-4 w-4" /> 다중 선택
              </button>
            )}
          </div>
        )}

        {/* 다중 선택 모드 안내 */}
        {selectMode && (
          <div className="mb-4 flex items-center justify-between rounded-2xl bg-muted px-4 py-3">
            <p className="text-sm font-medium text-foreground">
              {selectedCount > 0 ? `${selectedCount}장 선택됨` : '카드를 탭해서 선택하세요'}
            </p>
            <button
              onClick={exitSelectMode}
              className="rounded-xl bg-card px-3 py-1.5 text-sm font-semibold text-foreground shadow-sm"
            >
              취소
            </button>
          </div>
        )}

        {/* 다중 삭제 확인 */}
        {showBulkDeleteConfirm && (
          <div className="mb-4 rounded-2xl bg-destructive/10 p-4">
            <p className="mb-3 text-sm font-semibold text-destructive">
              선택한 {selectedCount}장의 카드를 삭제할까요?
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowBulkDeleteConfirm(false)} className="flex-1 rounded-xl bg-muted py-2.5 text-sm font-medium">취소</button>
              <button onClick={handleBulkDelete} className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-bold text-white">삭제</button>
            </div>
          </div>
        )}

        {/* 카드 수정 인라인 */}
        {cardToEdit && (
          <div className="mb-4 rounded-2xl bg-card border border-border p-4 shadow-sm">
            <p className="mb-2 text-sm font-semibold text-foreground">카드 수정</p>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">앞면</label>
            <textarea
              value={editFront}
              onChange={e => setEditFront(e.target.value)}
              rows={2}
              className="mb-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">뒷면</label>
            <textarea
              value={editBack}
              onChange={e => setEditBack(e.target.value)}
              rows={2}
              className="mb-3 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
            <div className="flex gap-2">
              <button onClick={() => setCardToEdit(null)} className="flex-1 rounded-xl bg-muted py-2.5 text-sm font-medium">취소</button>
              <button onClick={handleEditSave} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground">저장</button>
            </div>
          </div>
        )}

        {/* 카드 삭제 확인 */}
        {cardToDelete && (
          <div className="mb-4 rounded-2xl bg-destructive/10 p-4">
            <p className="mb-1 text-sm font-semibold text-destructive">이 카드를 삭제할까요?</p>
            <p className="mb-3 text-xs text-muted-foreground whitespace-pre-line line-clamp-2">"{cardToDelete.front}"</p>
            <div className="flex gap-2">
              <button onClick={() => setCardToDelete(null)} className="flex-1 rounded-xl bg-muted py-2.5 text-sm font-medium">취소</button>
              <button onClick={handleDelete} className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-bold text-white">삭제</button>
            </div>
          </div>
        )}

        {cards.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-card p-8 text-center shadow-sm">
            <Clock className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm font-medium text-muted-foreground">대기 중인 카드가 없습니다.</p>
            <p className="text-xs text-muted-foreground/70">카드 추가 시 대기로 보내면 여기에 표시됩니다.</p>
          </div>
        ) : skipCardMotion ? (
          <div className="flex flex-col gap-2">
            {cards.map((card) => (
              <WaitingCardRow
                key={card.id}
                card={card}
                selectMode={selectMode}
                selected={selectedIds.has(card.id)}
                skipMotion
                onToggleSelect={toggleSelect}
                onEdit={openEdit}
                onPromote={handlePromoteSingle}
                onDelete={setCardToDelete}
              />
            ))}
          </div>
        ) : (
          <motion.div
            className="flex flex-col gap-2"
            variants={containerVariants}
            initial="hidden"
            animate="show"
          >
            {cards.map(card => (
              <WaitingCardRow
                key={card.id}
                card={card}
                selectMode={selectMode}
                selected={selectedIds.has(card.id)}
                onToggleSelect={toggleSelect}
                onEdit={openEdit}
                onPromote={handlePromoteSingle}
                onDelete={setCardToDelete}
              />
            ))}
          </motion.div>
        )}
      </div>

      {/* 다중 선택 모드 하단 고정 바 */}
      {selectMode && (
        <div className="fixed bottom-20 left-0 right-0 z-40 flex gap-2 px-4 pb-2 pt-3 bg-background/95 backdrop-blur border-t border-border">
          <button
            onClick={() => selectedCount >= 1 && setShowBulkDeleteConfirm(true)}
            disabled={selectedCount === 0}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-destructive/90 py-3 text-sm font-bold text-white disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" /> 삭제{selectedCount > 0 ? ` (${selectedCount})` : ''}
          </button>
          <button
            onClick={handlePromote}
            disabled={selectedCount === 0}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-40"
          >
            <ArrowUp className="h-4 w-4" /> 1단계로 보내기{selectedCount > 0 ? ` (${selectedCount})` : ''}
          </button>
        </div>
      )}

      {/* 토스트 */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-28 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background shadow-lg"
          >
            <CheckCircle2 className="h-4 w-4" /> {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {addStackId && (
        <AddCardModal
          open={showAddCard}
          onClose={() => setShowAddCard(false)}
          stackId={addStackId}
          categoryId={categoryId}
        />
      )}
    </div>
  )
}
