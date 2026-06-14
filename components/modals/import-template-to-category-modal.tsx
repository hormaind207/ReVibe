'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronDown, Download } from 'lucide-react'
import type { DBCategory } from '@/lib/db'
import type { TemplateCardRow } from '@/lib/marketplace/templates'
import { importCardsToCategory, type CardDestination } from '@/lib/marketplace/receive'
import { playTemplateImport } from '@/lib/sounds'

interface ImportTemplateToCategoryModalProps {
  open: boolean
  onClose: () => void
  cards: TemplateCardRow[]
  categories: DBCategory[]
  onDone: (count: number) => void
}

export function ImportTemplateToCategoryModal({
  open,
  onClose,
  cards,
  categories,
  onDone,
}: ImportTemplateToCategoryModalProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [destination, setDestination] = useState<CardDestination>('waiting')
  const [showPicker, setShowPicker] = useState(false)
  const [loading, setLoading] = useState(false)

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId)

  const handleClose = () => {
    setSelectedCategoryId('')
    setDestination('waiting')
    setShowPicker(false)
    setLoading(false)
    onClose()
  }

  const handleImport = async () => {
    if (!selectedCategoryId || cards.length === 0) return
    setLoading(true)
    try {
      const count = await importCardsToCategory(cards, selectedCategoryId, destination)
      playTemplateImport()
      onDone(count)
      handleClose()
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
            className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm"
            onClick={handleClose}
          />
          <motion.div
            key="modal"
            initial={{ opacity: 0, y: 80 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 80 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="fixed bottom-0 left-0 right-0 z-[70] mx-auto max-w-md rounded-t-3xl bg-card p-6 shadow-xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">{cards.length}장 내 카테고리에 추가</h2>
              <button
                onClick={handleClose}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {/* Category picker */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">카테고리</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowPicker((v) => !v)}
                    className="flex w-full items-center justify-between rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    <span className={selectedCategory ? 'text-foreground' : 'text-muted-foreground/50'}>
                      {selectedCategory ? selectedCategory.name : '카테고리를 선택하세요'}
                    </span>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showPicker ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {showPicker && (
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
                              onClick={() => {
                                setSelectedCategoryId(cat.id)
                                setShowPicker(false)
                              }}
                              className={`flex w-full items-center gap-2 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted ${cat.id === selectedCategoryId ? 'text-primary' : 'text-foreground'}`}
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
              </div>

              {/* Destination */}
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

              <button
                type="button"
                onClick={handleImport}
                disabled={!selectedCategoryId || loading || cards.length === 0}
                className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {loading ? '추가 중...' : `${cards.length}장 추가`}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
