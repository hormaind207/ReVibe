'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronDown, Plus, CheckCircle2 } from 'lucide-react'
import { playCardAdd } from '@/lib/sounds'
import { BulkImportPanel } from '@/components/modals/bulk-import-panel'
import type { CardImportEntry } from '@/lib/import-cards'
import { getOrCreateTomorrowStack, getOrCreateWaitingStack } from '@/lib/leitner'
import { useCardAddFlow } from '@/lib/hooks/use-card-add-flow'
import type { DBCategory } from '@/lib/db'

interface QuickAddCardModalProps {
  open: boolean
  onClose: () => void
  categories: DBCategory[]
}

type AddMode = 'single' | 'bulk'
type Destination = 'stage1' | 'waiting'

export function QuickAddCardModal({ open, onClose, categories }: QuickAddCardModalProps) {
  const {
    warnOnDuplicateFront,
    setWarnOnDuplicateFront,
    addSingleCard,
    addBulkCards,
    duplicateDialog,
  } = useCardAddFlow()
  const [mode, setMode] = useState<AddMode>('single')
  const [destination, setDestination] = useState<Destination>('stage1')
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [addAnother, setAddAnother] = useState(false)
  const [showCategoryPicker, setShowCategoryPicker] = useState(false)

  // 일괄 추가
  const [bulkDone, setBulkDone] = useState(false)
  const [bulkImportedCount, setBulkImportedCount] = useState(0)
  const [bulkPanelKey, setBulkPanelKey] = useState(0)

  const selectedCategory = categories.find(c => c.id === selectedCategoryId)

  const resolveStackId = (catId: string) =>
    destination === 'waiting' ? getOrCreateWaitingStack(catId) : getOrCreateTomorrowStack(catId)

  const handleClose = () => {
    setMode('single')
    setAddAnother(false)
    setFront('')
    setBack('')
    setSelectedCategoryId('')
    setDestination('stage1')
    setLoading(false)
    setShowCategoryPicker(false)
    setBulkDone(false)
    setBulkImportedCount(0)
    setBulkPanelKey(k => k + 1)
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!front.trim() || !back.trim() || !selectedCategoryId) return
    setLoading(true)
    try {
      const stackId = await resolveStackId(selectedCategoryId)
      const added = await addSingleCard({
        stackId,
        categoryId: selectedCategoryId,
        front: front.trim(),
        back: back.trim(),
      })
      if (!added) return
      playCardAdd()
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

  const handleBulkImport = async (entries: CardImportEntry[]) => {
    if (entries.length === 0 || !selectedCategoryId) return
    setLoading(true)
    try {
      const stackId = await resolveStackId(selectedCategoryId)
      const count = await addBulkCards({ stackId, categoryId: selectedCategoryId, entries })
      if (count === 0) return
      playCardAdd()
      setBulkImportedCount(count)
      setBulkDone(true)
      setTimeout(() => {
        setBulkDone(false)
        setBulkPanelKey(k => k + 1)
        handleClose()
      }, 1200)
    } finally {
      setLoading(false)
    }
  }

  const destinationToggle = (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">추가 위치</label>
      <div className="flex rounded-xl bg-muted p-1">
        <button
          type="button"
          onClick={() => setDestination('stage1')}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${destination === 'stage1' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
        >
          1단계
        </button>
        <button
          type="button"
          onClick={() => setDestination('waiting')}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${destination === 'waiting' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
        >
          대기
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {destination === 'waiting'
          ? '대기함에 보관되며 복습 일정에 들어가지 않습니다.'
          : '다음 날 복습할 1단계 스택에 추가됩니다.'}
      </p>
    </div>
  )

  const duplicateWarnCheckbox = (
    <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
      <input
        type="checkbox"
        checked={warnOnDuplicateFront}
        onChange={e => setWarnOnDuplicateFront(e.target.checked)}
        className="accent-primary h-4 w-4 rounded"
      />
      앞면이 같으면 경고
    </label>
  )

  const categoryPicker = (
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
      {!selectedCategoryId && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">카테고리를 먼저 선택해 주세요.</p>
      )}
    </div>
    {destinationToggle}
    </div>
  )

  return (
    <>
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
            className="fixed bottom-0 left-0 right-0 z-[60] mx-auto max-w-md rounded-t-3xl bg-card p-6 shadow-xl max-h-[85vh] overflow-y-auto"
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

                {destinationToggle}

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

                {duplicateWarnCheckbox}

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
                    <p className="text-base font-bold text-foreground">{bulkImportedCount}장 추가 완료!</p>
                  </div>
                ) : (
                  <BulkImportPanel
                    key={bulkPanelKey}
                    header={
                      <div className="flex flex-col gap-4">
                        {categoryPicker}
                        {duplicateWarnCheckbox}
                      </div>
                    }
                    onImport={handleBulkImport}
                    loading={loading}
                    importDisabled={!selectedCategoryId}
                  />
                )}
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
    {duplicateDialog}
    </>
  )
}
