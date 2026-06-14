'use client'

import { useEffect, useRef, useState } from 'react'
import { Heart, Star, Flag, FolderPlus, CheckSquare, Square, Download, Loader2, BookOpen, BadgeCheck, Plus, Pencil, Trash2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { useNavigation } from '@/lib/store'
import { ScreenHeader } from '@/components/screen-header'
import { ICON_MAP } from '@/components/screens/dashboard'
import { useCategories } from '@/lib/hooks/use-categories'
import { useMarketplaceUser } from '@/lib/marketplace/auth'
import { getTemplateDetail, addCardsToTemplate, deleteTemplateCard, updateTemplateCard, type TemplateDetail, type TemplateCardRow } from '@/lib/marketplace/templates'
import { MAX_TEMPLATE_CARDS } from '@/lib/supabase'
import { toggleLike, toggleFavorite, reportTemplate } from '@/lib/marketplace/reactions'
import { importTemplateAsCategory } from '@/lib/marketplace/receive'
import { displayTag } from '@/lib/marketplace/hashtags'
import { ImportTemplateToCategoryModal } from '@/components/modals/import-template-to-category-modal'
import { playLike, playFavorite, playReport, playTemplateImport, playButtonTap, playCardAdd } from '@/lib/sounds'

export function TemplateDetailScreen({ templateId }: { templateId: string }) {
  const { navigate } = useNavigation()
  const { user, loading: authLoading } = useMarketplaceUser()
  const uid = user?.id ?? null
  const categories = useCategories() ?? []

  const [detail, setDetail] = useState<TemplateDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // selection
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showImportModal, setShowImportModal] = useState(false)
  const [confirmReport, setConfirmReport] = useState(false)
  // Guards against rapid double-taps causing duplicate like/favorite writes.
  const reactionBusyRef = useRef(false)

  // owner card editing
  const [showAddCard, setShowAddCard] = useState(false)
  const [addFront, setAddFront] = useState('')
  const [addBack, setAddBack] = useState('')
  const [cardBusy, setCardBusy] = useState(false)
  const [editingCard, setEditingCard] = useState<TemplateCardRow | null>(null)
  const [editFront, setEditFront] = useState('')
  const [editBack, setEditBack] = useState('')
  const [confirmDeleteCardId, setConfirmDeleteCardId] = useState<string | null>(null)

  const reloadDetail = async () => {
    const d = await getTemplateDetail(templateId, uid)
    if (d) setDetail(d)
  }

  useEffect(() => {
    if (authLoading) return
    let active = true
    setLoading(true)
    getTemplateDetail(templateId, uid).then((d) => {
      if (active) {
        setDetail(d)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [templateId, uid, authLoading])

  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  const handleLike = async () => {
    if (!detail || !uid) return
    const isOwner = detail.ownerId === uid
    if (isOwner) {
      flash('내 템플릿에는 좋아요할 수 없습니다. (리그 점수도 적립되지 않습니다)')
      return
    }
    if (reactionBusyRef.current) return
    reactionBusyRef.current = true
    try {
      const result = await toggleLike(detail.id, uid, detail.liked, detail.ownerId)
      if (!result.ok) {
        if (result.reason === 'own_template') {
          flash('내 템플릿에는 좋아요할 수 없습니다. (리그 점수도 적립되지 않습니다)')
        } else {
          flash('좋아요 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.')
        }
        return
      }
      if (result.liked) playLike()
      else playButtonTap()
      setDetail({ ...detail, liked: result.liked, likeCount: detail.likeCount + (result.liked ? 1 : -1) })
    } finally {
      reactionBusyRef.current = false
    }
  }

  const handleFavorite = async () => {
    if (!detail || !uid) return
    if (reactionBusyRef.current) return
    reactionBusyRef.current = true
    try {
      const next = await toggleFavorite(detail.id, uid, detail.favorited)
      // No state change means the write didn't persist → skip optimistic update.
      if (next === detail.favorited) return
      if (next) playFavorite()
      else playButtonTap()
      setDetail({ ...detail, favorited: next, favoriteCount: detail.favoriteCount + (next ? 1 : -1) })
    } finally {
      reactionBusyRef.current = false
    }
  }

  const handleReport = async () => {
    if (!detail || !uid || detail.reported) return
    const result = await reportTemplate(detail.id, uid, undefined)
    setConfirmReport(false)
    if (result === 'error') {
      flash('신고 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.')
      return
    }
    playReport()
    setDetail({ ...detail, reported: true })
    flash(result === 'reported' ? '신고가 접수되었습니다.' : '이미 신고한 템플릿입니다.')
  }

  const handleImportAsCategory = async () => {
    if (!detail) return
    setBusy(true)
    try {
      await importTemplateAsCategory(detail)
      playTemplateImport()
      flash(`'${detail.name}' 카테고리를 추가했습니다. (대기 단계)`)
    } finally {
      setBusy(false)
    }
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedCards = detail?.cards.filter((c) => selected.has(c.id)) ?? []

  const openEditCard = (card: TemplateCardRow) => {
    setEditingCard(card)
    setEditFront(card.front)
    setEditBack(card.back)
  }

  const handleAddCard = async () => {
    if (!detail || !addFront.trim() || !addBack.trim()) return
    if (detail.cards.length >= MAX_TEMPLATE_CARDS) {
      flash(`최대 ${MAX_TEMPLATE_CARDS}장까지 추가할 수 있습니다.`)
      return
    }
    setCardBusy(true)
    try {
      const added = await addCardsToTemplate(detail.id, [{ front: addFront, back: addBack }])
      if (added > 0) {
        playCardAdd()
        setAddFront('')
        setAddBack('')
        setShowAddCard(false)
        await reloadDetail()
        flash('카드를 추가했습니다.')
      } else {
        flash(`최대 ${MAX_TEMPLATE_CARDS}장까지 추가할 수 있습니다.`)
      }
    } catch {
      flash('카드 추가에 실패했습니다.')
    } finally {
      setCardBusy(false)
    }
  }

  const handleSaveEditCard = async () => {
    if (!editingCard || !editFront.trim() || !editBack.trim()) return
    setCardBusy(true)
    try {
      await updateTemplateCard(editingCard.id, { front: editFront, back: editBack })
      setEditingCard(null)
      await reloadDetail()
      flash('카드를 수정했습니다.')
    } catch {
      flash('카드 수정에 실패했습니다.')
    } finally {
      setCardBusy(false)
    }
  }

  const handleDeleteCard = async (cardId: string) => {
    setCardBusy(true)
    try {
      await deleteTemplateCard(cardId)
      setConfirmDeleteCardId(null)
      await reloadDetail()
      flash('카드를 삭제했습니다.')
    } catch {
      flash('카드 삭제에 실패했습니다.')
    } finally {
      setCardBusy(false)
    }
  }

  if (loading || authLoading) {
    return (
      <div className="flex flex-col pb-20">
        <ScreenHeader title="템플릿" showBack />
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          불러오는 중...
        </div>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="flex flex-col pb-20">
        <ScreenHeader title="템플릿" showBack />
        <p className="py-20 text-center text-sm text-muted-foreground">
          템플릿을 찾을 수 없거나 숨김 처리되었습니다.
        </p>
      </div>
    )
  }

  const Icon = ICON_MAP[detail.icon] || BookOpen
  const hasImage = Boolean(detail.imageUrl)
  const isOwner = Boolean(uid && detail.ownerId === uid)

  return (
    <div className="flex flex-col pb-28">
      <ScreenHeader title={detail.name} showBack />

      <div className="flex flex-col gap-5 px-4">
        {/* Hero */}
        <div
          className={`relative flex flex-col gap-2 overflow-hidden rounded-3xl p-5 shadow-sm ${hasImage ? 'bg-card' : detail.color ?? 'bg-muted'}`}
          style={hasImage ? { backgroundImage: `url(${detail.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
        >
          {hasImage && <span className="absolute inset-0 bg-black/45" aria-hidden />}
          <div className="relative flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-card/85 shadow-sm">
              <Icon className="h-7 w-7 text-foreground" />
            </div>
            <div className="min-w-0">
              <p className={`truncate text-lg font-extrabold ${hasImage ? 'text-white' : 'text-foreground'}`}>{detail.name}</p>
              <p className={`text-xs ${hasImage ? 'text-white/80' : 'text-muted-foreground'}`}>
                {detail.isOfficial ? (
                  <span className="inline-flex items-center gap-1">
                    Admin
                    <BadgeCheck className="h-3.5 w-3.5 text-primary" aria-label="공식" />
                  </span>
                ) : (
                  <button
                    onClick={() => navigate({ type: 'marketplace-author', ownerId: detail.ownerId })}
                    className="underline-offset-2 hover:underline"
                  >
                    {detail.nickname}
                  </button>
                )}
                {' · '}{detail.cardCount}장
              </p>
            </div>
          </div>
          {detail.hashtags.length > 0 && (
            <div className="relative mt-1 flex flex-wrap gap-1.5">
              {detail.hashtags.map((tag) => (
                <span
                  key={tag}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${hasImage ? 'bg-white/20 text-white' : 'bg-card/70 text-foreground'}`}
                >
                  {displayTag(tag)}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Reaction bar */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleFavorite}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-3 text-sm font-bold transition-colors ${detail.favorited ? 'bg-amber-400/20 text-amber-600' : 'bg-muted text-muted-foreground'}`}
          >
            <Star className={`h-4 w-4 ${detail.favorited ? 'fill-amber-500 text-amber-500' : ''}`} />
            즐겨찾기
          </button>
          <button
            onClick={handleLike}
            disabled={isOwner}
            title={isOwner ? '내 템플릿에는 좋아요할 수 없습니다' : undefined}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-3 text-sm font-bold transition-colors ${
              isOwner
                ? 'cursor-not-allowed bg-muted/50 text-muted-foreground/50'
                : detail.liked
                  ? 'bg-red-500/15 text-red-500'
                  : 'bg-muted text-muted-foreground'
            }`}
          >
            <Heart className={`h-4 w-4 ${detail.liked ? 'fill-red-500 text-red-500' : ''}`} />
            {detail.likeCount}
          </button>
          <button
            onClick={() => !detail.reported && setConfirmReport(true)}
            disabled={detail.reported}
            className={`flex items-center justify-center gap-1.5 rounded-2xl px-4 py-3 text-xs font-semibold transition-colors ${
              detail.reported
                ? 'bg-destructive/20 text-destructive cursor-not-allowed'
                : 'bg-destructive/10 text-destructive hover:bg-destructive/20'
            }`}
            aria-label={detail.reported ? '이미 신고함' : '신고'}
          >
            <Flag className={`h-4 w-4 ${detail.reported ? 'fill-destructive' : ''}`} />
            {detail.reported ? '신고됨' : '신고'}
          </button>
        </div>

        {/* Receive actions */}
        <div className="flex flex-col gap-2">
          <button
            onClick={handleImportAsCategory}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground transition-transform active:scale-95 disabled:opacity-50"
          >
            <FolderPlus className="h-4 w-4" />
            새 카테고리로 받기 (대기 단계)
          </button>
          <button
            onClick={() => {
              setSelectMode((v) => !v)
              setSelected(new Set())
              setShowAddCard(false)
            }}
            className="flex items-center justify-center gap-2 rounded-2xl bg-muted py-3 text-sm font-bold text-foreground transition-transform active:scale-95"
          >
            <CheckSquare className="h-4 w-4" />
            {selectMode ? '선택 취소' : '카드 선택해서 받기'}
          </button>
        </div>

        {/* Card list */}
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-foreground">카드 {detail.cards.length}장</h2>
            <div className="flex items-center gap-2">
              {isOwner && !selectMode && (
                <button
                  onClick={() => setShowAddCard((v) => !v)}
                  className="flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {showAddCard ? '닫기' : '카드 추가'}
                </button>
              )}
              {selectMode && (
                <button
                  onClick={() =>
                    setSelected((prev) =>
                      prev.size === detail.cards.length ? new Set() : new Set(detail.cards.map((c) => c.id))
                    )
                  }
                  className="text-xs font-semibold text-primary"
                >
                  {selected.size === detail.cards.length ? '전체 해제' : '전체 선택'}
                </button>
              )}
            </div>
          </div>

          {isOwner && showAddCard && !selectMode && (
            <div className="mb-3 flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
              <textarea
                value={addFront}
                onChange={(e) => setAddFront(e.target.value)}
                placeholder="앞면 (문제)"
                rows={2}
                className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <textarea
                value={addBack}
                onChange={(e) => setAddBack(e.target.value)}
                placeholder="뒷면 (정답)"
                rows={2}
                className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button
                onClick={handleAddCard}
                disabled={!addFront.trim() || !addBack.trim() || cardBusy || detail.cards.length >= MAX_TEMPLATE_CARDS}
                className="flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {cardBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                카드 추가
              </button>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {detail.cards.map((card) => {
              if (selectMode) {
                return (
                  <button
                    key={card.id}
                    onClick={() => toggleSelect(card.id)}
                    className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-left transition-colors ${
                      selected.has(card.id) ? 'bg-primary/10 ring-1 ring-primary/40' : 'bg-muted'
                    }`}
                  >
                    {selected.has(card.id) ? (
                      <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    ) : (
                      <Square className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="whitespace-pre-line text-sm font-semibold text-foreground">{card.front}</span>
                      <span className="whitespace-pre-line text-sm text-muted-foreground">{card.back}</span>
                    </div>
                  </button>
                )
              }

              return (
                <div key={card.id} className="flex items-start gap-2 rounded-xl bg-muted px-3 py-2.5">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="whitespace-pre-line text-sm font-semibold text-foreground">{card.front}</span>
                    <span className="whitespace-pre-line text-sm text-muted-foreground">{card.back}</span>
                  </div>
                  {isOwner && (
                    <div className="flex shrink-0 gap-0.5">
                      <button
                        onClick={() => openEditCard(card)}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                        aria-label="카드 수정"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteCardId(card.id)}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        aria-label="카드 삭제"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      </div>

      {/* Sticky selection bar */}
      {selectMode && selected.size > 0 && (
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="fixed bottom-0 left-0 right-0 z-30 mx-auto flex max-w-md items-center gap-3 border-t border-border bg-card/95 px-4 py-3 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
        >
          <span className="text-sm font-semibold text-foreground">{selected.size}장 선택됨</span>
          <button
            onClick={() => setShowImportModal(true)}
            className="ml-auto flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground"
          >
            <Download className="h-4 w-4" />
            카테고리에 추가
          </button>
        </motion.div>
      )}

      {/* Edit card modal */}
      {editingCard && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={() => setEditingCard(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="mb-3 text-base font-bold text-foreground">카드 수정</p>
            <div className="flex flex-col gap-2">
              <textarea
                value={editFront}
                onChange={(e) => setEditFront(e.target.value)}
                placeholder="앞면 (문제)"
                rows={3}
                className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <textarea
                value={editBack}
                onChange={(e) => setEditBack(e.target.value)}
                placeholder="뒷면 (정답)"
                rows={3}
                className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={handleSaveEditCard}
                disabled={!editFront.trim() || !editBack.trim() || cardBusy}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {cardBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                저장
              </button>
              <button
                onClick={() => setEditingCard(null)}
                className="flex-1 rounded-xl bg-muted py-2.5 text-sm font-medium text-foreground"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete card confirm */}
      {confirmDeleteCardId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmDeleteCardId(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="mb-4 text-sm text-foreground">이 카드를 삭제할까요?</p>
            <div className="flex gap-2">
              <button
                onClick={() => handleDeleteCard(confirmDeleteCardId)}
                disabled={cardBusy}
                className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                삭제
              </button>
              <button onClick={() => setConfirmDeleteCardId(null)} className="flex-1 rounded-xl bg-muted py-2.5 text-sm font-medium text-foreground">
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report confirm */}
      {confirmReport && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmReport(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="mb-1 text-base font-bold text-foreground">이 템플릿을 신고할까요?</p>
            <p className="mb-4 text-sm text-muted-foreground">
              신고가 누적되면 마켓플레이스에서 자동으로 숨김 처리되어 검토됩니다.
            </p>
            <div className="flex gap-2">
              <button onClick={handleReport} className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-bold text-white">
                신고하기
              </button>
              <button onClick={() => setConfirmReport(false)} className="flex-1 rounded-xl bg-muted py-2.5 text-sm font-medium text-foreground">
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      <ImportTemplateToCategoryModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        cards={selectedCards}
        categories={categories}
        onDone={(count) => {
          setSelectMode(false)
          setSelected(new Set())
          flash(`${count}장을 카테고리에 추가했습니다.`)
        }}
      />

      {toast && (
        <div className="fixed left-4 right-4 top-4 z-[80] mx-auto max-w-md rounded-xl bg-primary px-4 py-3 text-center text-sm font-medium text-primary-foreground shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
