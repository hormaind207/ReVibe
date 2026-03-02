'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { createCard } from '@/lib/hooks/use-cards'
import { playCardAdd } from '@/lib/sounds'

interface AddCardModalProps {
  open: boolean
  onClose: () => void
  stackId: string
  categoryId: string
}

export function AddCardModal({ open, onClose, stackId, categoryId }: AddCardModalProps) {
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [loading, setLoading] = useState(false)
  const [addAnother, setAddAnother] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!front.trim() || !back.trim()) return
    setLoading(true)
    try {
      await createCard({ stackId, categoryId, front: front.trim(), back: back.trim() })
      playCardAdd()
      if (addAnother) {
        setFront('')
        setBack('')
      } else {
        setFront('')
        setBack('')
        onClose()
      }
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
            onClick={onClose}
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
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

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

              <button
                type="submit"
                disabled={!front.trim() || !back.trim() || loading}
                className="rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground transition-transform active:scale-95 disabled:opacity-50"
              >
                {loading ? '추가 중...' : addAnother ? '추가 후 계속' : '카드 추가'}
              </button>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
