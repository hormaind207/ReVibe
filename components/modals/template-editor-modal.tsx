'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, BookOpen, Languages, Calculator, FlaskConical, Music, Globe,
  ImagePlus, Trash2, Plus, ChevronDown, Loader2, Save, FolderInput, Search,
} from 'lucide-react'
import { BulkImportPanel } from '@/components/modals/bulk-import-panel'
import { HashtagInput } from '@/components/marketplace/hashtag-input'
import type { CardImportEntry } from '@/lib/import-cards'
import { useCategories } from '@/lib/hooks/use-categories'
import { MAX_TEMPLATE_CARDS } from '@/lib/supabase'
import { uploadTemplateImage } from '@/lib/marketplace/images'
import {
  createTemplate, createOfficialTemplate, updateTemplate, setTemplateHashtags, addCardsToTemplate,
  getTemplateCards, deleteTemplateCard, importLocalCategoryToTemplate,
  type TemplateCardRow, type TemplateDetail,
} from '@/lib/marketplace/templates'
import { playPublishSuccess, playCardAdd } from '@/lib/sounds'

const ICONS = [
  { key: 'book', Icon: BookOpen },
  { key: 'languages', Icon: Languages },
  { key: 'calculator', Icon: Calculator },
  { key: 'flask', Icon: FlaskConical },
  { key: 'music', Icon: Music },
  { key: 'globe', Icon: Globe },
]

const COLORS = [
  'bg-[#fdb99b]/40', 'bg-[#a8d8b9]/40', 'bg-[#89cff0]/40',
  'bg-[#e8d5f5]/40', 'bg-[#f4a7bb]/40', 'bg-[#fce4b8]/40',
]

type AddMethod = 'single' | 'bulk' | 'category'
type BgTab = 'color' | 'upload' | 'stock'

interface StockPhoto {
  id: string
  thumb: string
  regular: string
  raw: string
  alt: string
  author: string
  authorUrl: string
  downloadLocation?: string
}

interface TemplateEditorModalProps {
  open: boolean
  onClose: () => void
  uid: string
  /** Existing template to edit (with current meta). Undefined = create new. */
  existing?: TemplateDetail | null
  onSaved: () => void
  /** Dev mode Admin persona — creates official template */
  asOfficial?: boolean
}

export function TemplateEditorModal({ open, onClose, uid, existing, onSaved, asOfficial = false }: TemplateEditorModalProps) {
  const categories = useCategories() ?? []
  const fileRef = useRef<HTMLInputElement>(null)

  const [currentId, setCurrentId] = useState<string | null>(existing?.id ?? null)
  const [name, setName] = useState(existing?.name ?? '')
  const [icon, setIcon] = useState(existing?.icon ?? 'book')
  const [bgTab, setBgTab] = useState<BgTab>(existing?.imageUrl ? 'upload' : 'color')
  const [color, setColor] = useState(existing?.color ?? COLORS[0])
  const [imageUrl, setImageUrl] = useState<string | null>(existing?.imageUrl ?? null)
  const [tags, setTags] = useState<string[]>(existing?.hashtags ?? [])
  const [savingMeta, setSavingMeta] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Stock image state (Unsplash only)
  const [stockQuery, setStockQuery] = useState('')
  const [stockResults, setStockResults] = useState<StockPhoto[]>([])
  const [stockLoading, setStockLoading] = useState(false)
  const [stockError, setStockError] = useState<string | null>(null)

  const [cards, setCards] = useState<TemplateCardRow[]>([])
  const [addMethod, setAddMethod] = useState<AddMethod>('single')
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [selectedCatId, setSelectedCatId] = useState('')
  const [showCatPicker, setShowCatPicker] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setCurrentId(existing?.id ?? null)
    setName(existing?.name ?? '')
    setIcon(existing?.icon ?? 'book')
    setBgTab(existing?.imageUrl ? 'upload' : 'color')
    setColor(existing?.color ?? COLORS[0])
    setImageUrl(existing?.imageUrl ?? null)
    setTags(existing?.hashtags ?? [])
    setFront('')
    setBack('')
    setAddMethod('single')
    setSelectedCatId('')
    setStockResults([])
    setStockQuery('')
    setStockError(null)
    if (existing?.id) {
      getTemplateCards(existing.id).then(setCards)
    } else {
      setCards([])
    }
  }, [open, existing])

  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }

  const reloadCards = async (id: string) => setCards(await getTemplateCards(id))

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadTemplateImage(file, uid)
      setImageUrl(url)
      setBgTab('upload')
    } catch {
      flash('이미지 업로드에 실패했습니다.')
    } finally {
      setUploading(false)
    }
  }

  const handleStockSearch = useCallback(async () => {
    if (!stockQuery.trim()) return
    setStockLoading(true)
    setStockError(null)
    try {
      const res = await fetch(
        `/api/stock/unsplash?q=${encodeURIComponent(stockQuery)}&page=1`
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        if (res.status === 503) {
          setStockError('Unsplash API 키가 설정되지 않았습니다.')
        } else {
          setStockError(body.error ?? '검색에 실패했습니다.')
        }
        setStockResults([])
        return
      }
      const data = await res.json()
      setStockResults(data.results ?? [])
    } catch {
      setStockError('검색에 실패했습니다.')
    } finally {
      setStockLoading(false)
    }
  }, [stockQuery])

  const handleSelectStockPhoto = async (photo: StockPhoto) => {
    setUploading(true)
    try {
      // Trigger Unsplash download tracking (required by API guidelines)
      if (photo.downloadLocation) {
        fetch(`/api/stock/unsplash?dl=${encodeURIComponent(photo.downloadLocation)}`).catch(() => {})
      }
      const imgRes = await fetch(photo.regular)
      const blob = await imgRes.blob()
      const file = new File([blob], `stock-${photo.id}.jpg`, { type: blob.type })
      const url = await uploadTemplateImage(file, uid)
      setImageUrl(url)
      setBgTab('upload')
    } catch {
      flash('이미지 업로드에 실패했습니다.')
    } finally {
      setUploading(false)
    }
  }

  const handleSaveMeta = async () => {
    if (!name.trim()) return
    setSavingMeta(true)
    try {
      const useImage = bgTab !== 'color'
      const finalColor = useImage ? null : color
      const finalImage = useImage ? imageUrl : null
      if (currentId) {
        await updateTemplate(currentId, { name, icon, color: finalColor, imageUrl: finalImage })
        await setTemplateHashtags(currentId, tags)
        flash('저장되었습니다.')
      } else {
        const id = asOfficial
          ? await createOfficialTemplate({ name, icon, color: finalColor, imageUrl: finalImage, hashtags: tags })
          : await createTemplate({ name, icon, color: finalColor, imageUrl: finalImage, hashtags: tags }, uid)
        setCurrentId(id)
        flash('템플릿을 만들었습니다. 이제 카드를 추가하세요.')
      }
      playPublishSuccess()
      onSaved()
    } catch {
      flash('저장에 실패했습니다.')
    } finally {
      setSavingMeta(false)
    }
  }

  const handleAddSingle = async () => {
    if (!currentId || !front.trim() || !back.trim()) return
    setAddLoading(true)
    try {
      const added = await addCardsToTemplate(currentId, [{ front, back }])
      if (added > 0) {
        playCardAdd()
        setFront('')
        setBack('')
        await reloadCards(currentId)
      } else {
        flash(`최대 ${MAX_TEMPLATE_CARDS}장까지 추가할 수 있습니다.`)
      }
    } finally {
      setAddLoading(false)
    }
  }

  const handleBulk = async (entries: CardImportEntry[]) => {
    if (!currentId) return
    setAddLoading(true)
    try {
      const added = await addCardsToTemplate(currentId, entries)
      if (added > 0) playCardAdd()
      await reloadCards(currentId)
      flash(added > 0 ? `${added}장 추가되었습니다.` : `최대 ${MAX_TEMPLATE_CARDS}장까지 추가할 수 있습니다.`)
    } finally {
      setAddLoading(false)
    }
  }

  const handleImportCategory = async () => {
    if (!currentId || !selectedCatId) return
    setAddLoading(true)
    try {
      const added = await importLocalCategoryToTemplate(currentId, selectedCatId)
      if (added > 0) playCardAdd()
      await reloadCards(currentId)
      flash(added > 0 ? `${added}장 가져왔습니다.` : '추가할 카드가 없거나 한도를 초과했습니다.')
    } finally {
      setAddLoading(false)
    }
  }

  const handleDeleteCard = async (id: string) => {
    await deleteTemplateCard(id)
    if (currentId) await reloadCards(currentId)
  }

  const selectedCat = categories.find((c) => c.id === selectedCatId)
  const remaining = MAX_TEMPLATE_CARDS - cards.length

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            key="modal"
            initial={{ opacity: 0, y: 80 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 80 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="fixed bottom-0 left-0 right-0 z-[60] mx-auto max-h-[90vh] max-w-md overflow-y-auto rounded-t-3xl bg-card p-6 shadow-xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">{currentId ? '템플릿 편집' : '새 템플릿'}</h2>
              <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-5">
              {/* Name */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">템플릿 이름</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={40}
                  placeholder="예: 토익 필수 단어"
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {/* Icon */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">아이콘</label>
                <div className="flex gap-2">
                  {ICONS.map(({ key, Icon }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setIcon(key)}
                      className={`flex h-11 w-11 items-center justify-center rounded-xl transition-all ${icon === key ? 'bg-primary text-primary-foreground shadow-md' : 'bg-muted text-muted-foreground'}`}
                    >
                      <Icon className="h-5 w-5" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Background: color / upload / stock */}
              <div>
                <div className="mb-1.5 flex rounded-xl bg-muted p-1">
                  {(['color', 'upload', 'stock'] as BgTab[]).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setBgTab(tab)}
                      className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${bgTab === tab ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
                    >
                      {tab === 'color' ? '색상' : tab === 'upload' ? '직접 업로드' : '스톡 이미지'}
                    </button>
                  ))}
                </div>

                {bgTab === 'color' && (
                  <div className="flex gap-2">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        className={`h-9 w-9 rounded-full ${c} transition-all ${color === c ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                      />
                    ))}
                  </div>
                )}

                {bgTab === 'upload' && (
                  <div>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="relative flex h-28 w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-background"
                      style={imageUrl ? { backgroundImage: `url(${imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
                    >
                      {imageUrl && <span className="absolute inset-0 bg-black/30" />}
                      <span className="relative flex flex-col items-center gap-1 text-sm font-semibold text-foreground">
                        {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-6 w-6" />}
                        <span className={imageUrl ? 'text-white' : 'text-muted-foreground'}>
                          {uploading ? '업로드 중...' : imageUrl ? '이미지 변경' : '이미지 업로드'}
                        </span>
                      </span>
                    </button>
                  </div>
                )}

                {bgTab === 'stock' && (
                  <div className="flex flex-col gap-2">
                    {/* Search input */}
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <input
                          value={stockQuery}
                          onChange={(e) => setStockQuery(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleStockSearch()}
                          placeholder="예: study, nature, english"
                          className="w-full rounded-xl border border-border bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleStockSearch}
                        disabled={stockLoading || !stockQuery.trim()}
                        className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
                      >
                        {stockLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : '검색'}
                      </button>
                    </div>

                    {stockError && (
                      <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">{stockError}</p>
                    )}

                    {/* Results grid — fixed row height prevents vertical overlap */}
                    {stockResults.length > 0 && (
                      <div className="grid max-h-64 grid-cols-3 gap-1.5 overflow-y-auto content-start auto-rows-[5rem]">
                        {stockResults.map((photo) => (
                          <button
                            key={photo.id}
                            type="button"
                            onClick={() => handleSelectStockPhoto(photo)}
                            disabled={uploading}
                            className="flex h-full min-h-0 w-full items-center justify-center overflow-hidden rounded-lg bg-muted p-1 transition-opacity hover:opacity-80 disabled:opacity-50"
                            title={`${photo.alt} — ${photo.author}`}
                            aria-label={photo.alt || '스톡 이미지 선택'}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={photo.thumb}
                              alt=""
                              className="block max-h-full max-w-full object-contain"
                            />
                          </button>
                        ))}
                      </div>
                    )}

                    {stockResults.length > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        이미지 제공: Unsplash (선택 시 출처 기록됨)
                      </p>
                    )}

                    {uploading && (
                      <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        이미지 업로드 중...
                      </div>
                    )}

                    {imageUrl && !uploading && (
                      <div
                        className="relative h-20 w-full overflow-hidden rounded-xl"
                        style={{ backgroundImage: `url(${imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                      >
                        <span className="absolute inset-0 bg-black/30" />
                        <span className="relative flex h-full items-center justify-center text-xs font-semibold text-white">
                          선택된 이미지
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Hashtags */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">해시태그</label>
                <HashtagInput tags={tags} onChange={setTags} />
              </div>

              <button
                type="button"
                onClick={handleSaveMeta}
                disabled={!name.trim() || savingMeta}
                className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground transition-transform active:scale-95 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {savingMeta ? '저장 중...' : currentId ? '정보 저장' : '템플릿 만들기'}
              </button>

              {/* Card management (only after the template exists) */}
              {currentId && (
                <div className="border-t border-border pt-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-base font-bold text-foreground">카드</h3>
                    <span className={`text-xs font-semibold ${remaining <= 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {cards.length} / {MAX_TEMPLATE_CARDS}
                    </span>
                  </div>

                  <div className="mb-4 flex rounded-xl bg-muted p-1">
                    {([['single', '직접 추가'], ['bulk', '일괄 추가'], ['category', '카테고리 가져오기']] as [AddMethod, string][]).map(([m, label]) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setAddMethod(m)}
                        className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${addMethod === m ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {addMethod === 'single' && (
                    <div className="flex flex-col gap-2">
                      <textarea
                        value={front}
                        onChange={(e) => setFront(e.target.value)}
                        placeholder="앞면 (문제)"
                        rows={2}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                      />
                      <textarea
                        value={back}
                        onChange={(e) => setBack(e.target.value)}
                        placeholder="뒷면 (정답)"
                        rows={2}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddSingle}
                        disabled={!front.trim() || !back.trim() || addLoading || remaining <= 0}
                        className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
                      >
                        <Plus className="h-4 w-4" />
                        카드 추가
                      </button>
                    </div>
                  )}

                  {addMethod === 'bulk' && (
                    <BulkImportPanel onImport={handleBulk} loading={addLoading} importDisabled={remaining <= 0} />
                  )}

                  {addMethod === 'category' && (
                    <div className="flex flex-col gap-2">
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowCatPicker((v) => !v)}
                          className="flex w-full items-center justify-between rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/40"
                        >
                          <span className={selectedCat ? 'text-foreground' : 'text-muted-foreground/50'}>
                            {selectedCat ? selectedCat.name : '가져올 카테고리 선택'}
                          </span>
                          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showCatPicker ? 'rotate-180' : ''}`} />
                        </button>
                        <AnimatePresence>
                          {showCatPicker && (
                            <motion.div
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              className="absolute left-0 right-0 top-full z-10 mt-1 max-h-52 overflow-y-auto rounded-xl border border-border bg-card shadow-lg"
                            >
                              {categories.length === 0 ? (
                                <div className="px-4 py-3 text-xs text-muted-foreground">카테고리가 없습니다.</div>
                              ) : (
                                categories.map((cat) => (
                                  <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() => { setSelectedCatId(cat.id); setShowCatPicker(false) }}
                                    className={`flex w-full items-center gap-2 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted ${cat.id === selectedCatId ? 'text-primary' : 'text-foreground'}`}
                                  >
                                    <span className={`h-3 w-3 rounded-full ${cat.backgroundImage ? 'bg-primary' : cat.color}`} />
                                    {cat.name}
                                  </button>
                                ))
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                      <p className="text-[11px] text-muted-foreground">카테고리 안의 모든 카드를 가져옵니다 (단계·스택 무관).</p>
                      <button
                        type="button"
                        onClick={handleImportCategory}
                        disabled={!selectedCatId || addLoading || remaining <= 0}
                        className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
                      >
                        <FolderInput className="h-4 w-4" />
                        {addLoading ? '가져오는 중...' : '카테고리 카드 가져오기'}
                      </button>
                    </div>
                  )}

                  {/* Card list */}
                  {cards.length > 0 && (
                    <div className="mt-4 flex max-h-60 flex-col gap-2 overflow-y-auto">
                      {cards.map((card) => (
                        <div key={card.id} className="flex items-start gap-2 rounded-xl bg-muted px-3 py-2.5">
                          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="whitespace-pre-line text-sm font-semibold text-foreground line-clamp-2">{card.front}</span>
                            <span className="whitespace-pre-line text-xs text-muted-foreground line-clamp-2">{card.back}</span>
                          </div>
                          <button
                            onClick={() => handleDeleteCard(card.id)}
                            className="shrink-0 text-muted-foreground hover:text-destructive"
                            aria-label="카드 삭제"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {toast && (
              <div className="pointer-events-none fixed left-4 right-4 top-4 z-[80] mx-auto max-w-md rounded-xl bg-primary px-4 py-3 text-center text-sm font-medium text-primary-foreground shadow-lg">
                {toast}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
