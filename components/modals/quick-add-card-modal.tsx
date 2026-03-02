'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronDown, Plus, Upload, CheckCircle2 } from 'lucide-react'
import { createCard, parseImportText, bulkImportCards } from '@/lib/hooks/use-cards'
import { db, generateId } from '@/lib/db'
import { getNextReviewDate, mergeEligibleStacks } from '@/lib/leitner'
import type { DBCategory } from '@/lib/db'

interface QuickAddCardModalProps {
  open: boolean
  onClose: () => void
  categories: DBCategory[]
}

/** Get or create a stage-1 stack with nextReviewDate = tomorrow (for new cards). */
async function getOrCreateTomorrowStack(categoryId: string): Promise<string> {
  const tomorrow = getNextReviewDate(1)

  const existing = await db.stacks
    .where('categoryId').equals(categoryId)
    .filter(s => s.stage === 1 && !s.isCompleted && s.nextReviewDate === tomorrow)
    .first()

  if (existing) return existing.id

  const now = Date.now()
  const stackId = generateId()
  await db.stacks.add({
    id: stackId,
    categoryId,
    stage: 1,
    nextReviewDate: tomorrow,
    scheduledReviewDate: tomorrow,
    isCompleted: false,
    createdAt: now,
    updatedAt: now,
  })
  await mergeEligibleStacks(categoryId)
  return stackId
}

type AddMode = 'single' | 'bulk'

export function QuickAddCardModal({ open, onClose, categories }: QuickAddCardModalProps) {
  const [mode, setMode] = useState<AddMode>('single')
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [addAnother, setAddAnother] = useState(false)
  const [showCategoryPicker, setShowCategoryPicker] = useState(false)

  // 일괄 추가
  const [bulkText, setBulkText] = useState('')
  const [bulkParsed, setBulkParsed] = useState<Array<{ front: string; back: string }>>([])
  const [bulkStep, setBulkStep] = useState<'input' | 'preview'>('input')
  const [bulkDone, setBulkDone] = useState(false)

  const selectedCategory = categories.find(c => c.id === selectedCategoryId)

  const handleClose = () => {
    setFront('')
    setBack('')
    setSelectedCategoryId('')
    setLoading(false)
    setShowCategoryPicker(false)
    setBulkText('')
    setBulkParsed([])
    setBulkStep('input')
    setBulkDone(false)
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!front.trim() || !back.trim() || !selectedCategoryId) return
    setLoading(true)
    try {
      const stackId = await getOrCreateTomorrowStack(selectedCategoryId)
      await createCard({ stackId, categoryId: selectedCategoryId, front: front.trim(), back: back.trim() })
      if (addAnother) {
        setFront('')
        setBack('')
      } else {
        handleClose()
      }
    } finally {
      setLoading(false)
    }
  }

  const handleBulkParse = () => {
    setBulkParsed(parseImportText(bulkText))
    setBulkStep('preview')
  }

  const handleBulkImport = async () => {
    if (bulkParsed.length === 0 || !selectedCategoryId) return
    setLoading(true)
    try {
      const stackId = await getOrCreateTomorrowStack(selectedCategoryId)
      await bulkImportCards(stackId, selectedCategoryId, bulkParsed)
      setBulkDone(true)
      setTimeout(() => {
        setBulkText('')
        setBulkParsed([])
        setBulkStep('input')
        setBulkDone(false)
        handleClose()
      }, 1200)
    } finally {
      setLoading(false)
    }
  }

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
            onClick={handleClose}
          />
          <motion.div
            key="modal"
            initial={{ opacity: 0, y: 80 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 80 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="fixed bottom-0 left-0 right-0 z-[60] mx-auto max-w-md rounded-t-3xl bg-card p-6 shadow-xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">카드 추가</h2>
              <button
                onClick={handleClose}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 모드 전환: 1장 추가 / 일괄 추가 */}
            <div className="mb-4 flex rounded-xl bg-muted p-1">
              <button
                type="button"
                onClick={() => setMode('single')}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${mode === 'single' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                1장 추가
              </button>
              <button
                type="button"
                onClick={() => setMode('bulk')}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${mode === 'bulk' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                일괄 추가
              </button>
            </div>

            {mode === 'single' && (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">카테고리</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowCategoryPicker(v => !v)}
                      className="flex w-full items-center justify-between rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      <span className={selectedCategory ? 'text-foreground' : 'text-muted-foreground/50'}>
                        {selectedCategory ? selectedCategory.name : '카테고리를 선택하세요'}
                      </span>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showCategoryPicker ? 'rotate-180' : ''}`} />
                    </button>
                    <AnimatePresence>
                      {showCategoryPicker && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-border bg-card shadow-lg"
                        >
                          {categories.length === 0 ? (
                            <div className="px-4 py-3 text-xs text-muted-foreground">카테고리가 없습니다.</div>
                          ) : (
                            categories.map(cat => (
                              <button
                                key={cat.id}
                                type="button"
                                onClick={() => { setSelectedCategoryId(cat.id); setShowCategoryPicker(false) }}
                                className={`flex w-full items-center gap-2 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted ${cat.id === selectedCategoryId ? 'text-primary' : 'text-foreground'}`}
                              >
                                <span className={`h-3 w-3 rounded-full ${cat.color}`} />
                                {cat.name}
                              </button>
                            ))
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">앞면 (문제)</label>
                  <textarea
                    value={front}
                    onChange={e => setFront(e.target.value)}
                    placeholder="예: Ephemeral"
                    rows={2}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">뒷면 (정답)</label>
                  <textarea
                    value={back}
                    onChange={e => setBack(e.target.value)}
                    placeholder="예: 순간적인, 덧없는"
                    rows={2}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                  />
                </div>

                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addAnother}
                    onChange={e => setAddAnother(e.target.checked)}
                    className="accent-primary h-4 w-4 rounded"
                  />
                  계속 추가하기
                </label>

                <p className="text-xs text-muted-foreground -mt-1">
                  추가된 카드는 다음 날 복습할 스택에 자동으로 포함됩니다.
                </p>

                <button
                  type="submit"
                  disabled={!front.trim() || !back.trim() || !selectedCategoryId || loading}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground transition-transform active:scale-95 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  {loading ? '추가 중...' : addAnother ? '추가 후 계속' : '카드 추가'}
                </button>
              </form>
            )}

            {mode === 'bulk' && (
              <>
                {bulkDone ? (
                  <div className="flex flex-col items-center gap-3 py-8">
                    <CheckCircle2 className="h-12 w-12 text-success" />
                    <p className="text-base font-bold text-foreground">{bulkParsed.length}장 추가 완료!</p>
                  </div>
                ) : bulkStep === 'input' ? (
                  <div className="flex flex-col gap-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">카테고리</label>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowCategoryPicker(v => !v)}
                          className="flex w-full items-center justify-between rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                        >
                          <span className={selectedCategory ? 'text-foreground' : 'text-muted-foreground/50'}>
                            {selectedCategory ? selectedCategory.name : '카테고리를 선택하세요'}
                          </span>
                          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showCategoryPicker ? 'rotate-180' : ''}`} />
                        </button>
                        <AnimatePresence>
                          {showCategoryPicker && (
                            <motion.div
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-border bg-card shadow-lg"
                            >
                              {categories.length === 0 ? (
                                <div className="px-4 py-3 text-xs text-muted-foreground">카테고리가 없습니다.</div>
                              ) : (
                                categories.map(cat => (
                                <button
                                  key={cat.id}
                                  type="button"
                                  onClick={() => { setSelectedCategoryId(cat.id); setShowCategoryPicker(false) }}
                                  className={`flex w-full items-center gap-2 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted ${cat.id === selectedCategoryId ? 'text-primary' : 'text-foreground'}`}
                                >
                                  <span className={`h-3 w-3 rounded-full ${cat.color}`} />
                                  {cat.name}
                                </button>
                                ))
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                    <div className="rounded-xl bg-muted p-3">
                      <p className="text-xs font-semibold text-muted-foreground mb-1">입력 형식</p>
                      <p className="text-xs text-muted-foreground">
                        한 줄에 <strong>앞면. 뒷면</strong> 또는 <strong>앞면[탭]뒷면</strong> 형식으로 입력하세요.
                      </p>
                      <code className="mt-2 block text-xs bg-card rounded-lg p-2 text-foreground">
                        Meticulous. 세심한<br />
                        Ephemeral. 덧없는
                      </code>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">카드 데이터 입력</label>
                      <textarea
                        value={bulkText}
                        onChange={e => setBulkText(e.target.value)}
                        placeholder="Meticulous. 세심한&#10;Ephemeral. 덧없는"
                        rows={6}
                        className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none font-mono"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleBulkParse}
                      disabled={!bulkText.trim() || !selectedCategoryId}
                      className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
                    >
                      <Upload className="h-4 w-4" />
                      미리보기
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-foreground">{bulkParsed.length}개 카드 인식됨</p>
                      <button type="button" onClick={() => setBulkStep('input')} className="text-xs text-primary font-semibold">
                        수정
                      </button>
                    </div>
                    <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                      {bulkParsed.map((item, i) => (
                        <div key={i} className="flex gap-2 rounded-xl bg-muted px-3 py-2.5">
                          <span className="text-xs font-semibold text-muted-foreground w-5 flex-shrink-0">{i + 1}</span>
                          <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                            <span className="text-xs font-semibold text-foreground truncate">{item.front}</span>
                            <span className="text-xs text-muted-foreground truncate">{item.back}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={handleBulkImport}
                      disabled={loading || bulkParsed.length === 0}
                      className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
                    >
                      {loading ? '추가 중...' : `${bulkParsed.length}장 추가`}
                    </button>
                  </div>
                )}
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
