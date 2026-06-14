'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, CheckCircle2 } from 'lucide-react'
import { playCardAdd } from '@/lib/sounds'
import { BulkImportPanel } from '@/components/modals/bulk-import-panel'
import type { CardImportEntry } from '@/lib/import-cards'
import { useCardAddFlow } from '@/lib/hooks/use-card-add-flow'

interface AddCardModalProps {
  open: boolean
  onClose: () => void
  stackId: string
  categoryId: string
}

type AddMode = 'single' | 'bulk'

export function AddCardModal({ open, onClose, stackId, categoryId }: AddCardModalProps) {
  const {
    warnOnDuplicateFront,
    setWarnOnDuplicateFront,
    addSingleCard,
    addBulkCards,
    duplicateDialog,
  } = useCardAddFlow()
  const [mode, setMode] = useState<AddMode>('single')
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [loading, setLoading] = useState(false)
  const [addAnother, setAddAnother] = useState(false)
  const [bulkDone, setBulkDone] = useState(false)
  const [bulkImportedCount, setBulkImportedCount] = useState(0)
  const [bulkPanelKey, setBulkPanelKey] = useState(0)

  const handleClose = () => {
    setMode('single')
    setFront('')
    setBack('')
    setLoading(false)
    setAddAnother(false)
    setBulkDone(false)
    setBulkImportedCount(0)
    setBulkPanelKey(k => k + 1)
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!front.trim() || !back.trim()) return
    setLoading(true)
    try {
      const added = await addSingleCard({
        stackId,
        categoryId,
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
    if (entries.length === 0) return
    setLoading(true)
    try {
      const count = await addBulkCards({ stackId, categoryId, entries })
      if (count === 0) return
      playCardAdd()
      setBulkImportedCount(count)
      setBulkDone(true)
      setTimeout(() => {
        handleClose()
      }, 1200)
    } finally {
      setLoading(false)
    }
  }

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

            {mode === 'single' ? (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">앞면 (문제)</label>
                  <textarea
                    value={front}
                    onChange={e => setFront(e.target.value)}
                    placeholder="예: Ephemeral"
                    rows={2}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                    autoFocus
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
                  disabled={!front.trim() || !back.trim() || loading}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground transition-transform active:scale-95 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  {loading ? '추가 중...' : addAnother ? '추가 후 계속' : '카드 추가'}
                </button>
              </form>
            ) : bulkDone ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <CheckCircle2 className="h-12 w-12 text-success" />
                <p className="text-base font-bold text-foreground">{bulkImportedCount}장 추가 완료!</p>
              </div>
            ) : (
              <>
                <div className="mb-4">{duplicateWarnCheckbox}</div>
                <BulkImportPanel
                  key={bulkPanelKey}
                  onImport={handleBulkImport}
                  loading={loading}
                />
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
