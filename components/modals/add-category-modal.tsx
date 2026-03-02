'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, BookOpen, Languages, Calculator, FlaskConical, Music, Globe } from 'lucide-react'
import { createCategory } from '@/lib/hooks/use-categories'
import { DEFAULT_MAX_STAGES } from '@/lib/leitner'

const ICONS = [
  { key: 'book', Icon: BookOpen, label: '책' },
  { key: 'languages', Icon: Languages, label: '언어' },
  { key: 'calculator', Icon: Calculator, label: '계산기' },
  { key: 'flask', Icon: FlaskConical, label: '플라스크' },
  { key: 'music', Icon: Music, label: '음악' },
  { key: 'globe', Icon: Globe, label: '지구본' },
]

const COLORS = [
  { key: 'bg-[#fdb99b]/40', label: '복숭아' },
  { key: 'bg-[#a8d8b9]/40', label: '민트' },
  { key: 'bg-[#89cff0]/40', label: '하늘' },
  { key: 'bg-[#e8d5f5]/40', label: '라벤더' },
  { key: 'bg-[#f4a7bb]/40', label: '핑크' },
  { key: 'bg-[#fce4b8]/40', label: '노랑' },
]

interface AddCategoryModalProps {
  open: boolean
  onClose: () => void
}

export function AddCategoryModal({ open, onClose }: AddCategoryModalProps) {
  const [name, setName] = useState('')
  const [selectedIcon, setSelectedIcon] = useState('book')
  const [selectedColor, setSelectedColor] = useState('bg-[#fdb99b]/40')
  const [maxStages, setMaxStages] = useState(DEFAULT_MAX_STAGES)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      const saved = localStorage.getItem('defaultMaxStages')
      setMaxStages(saved ? parseInt(saved, 10) : DEFAULT_MAX_STAGES)
    }
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      await createCategory({ name: name.trim(), icon: selectedIcon, color: selectedColor, maxStages })
      setName('')
      setSelectedIcon('book')
      setSelectedColor('bg-[#fdb99b]/40')
      setMaxStages(DEFAULT_MAX_STAGES)
      onClose()
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
              <h2 className="text-lg font-bold text-foreground">새 카테고리 추가</h2>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {/* Name */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">카테고리 이름</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="예: 영어 단어, 수학 공식..."
                  maxLength={30}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  autoFocus
                />
              </div>

              {/* Icon picker */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">아이콘</label>
                <div className="flex gap-2">
                  {ICONS.map(({ key, Icon, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedIcon(key)}
                      className={`flex h-11 w-11 items-center justify-center rounded-xl transition-all ${
                        selectedIcon === key
                          ? 'bg-primary text-primary-foreground shadow-md'
                          : 'bg-muted text-muted-foreground'
                      }`}
                      aria-label={label}
                    >
                      <Icon className="h-5 w-5" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Color picker */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">색상</label>
                <div className="flex gap-2">
                  {COLORS.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedColor(key)}
                      className={`flex h-9 w-9 items-center justify-center rounded-full ${key} transition-all ${
                        selectedColor === key ? 'ring-2 ring-primary ring-offset-2' : ''
                      }`}
                      aria-label={label}
                    />
                  ))}
                </div>
              </div>

              {/* Max Stages */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                  졸업까지 단계 수 <span className="text-primary font-bold">{maxStages}단계</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={3}
                    max={10}
                    value={maxStages}
                    onChange={e => setMaxStages(parseInt(e.target.value, 10))}
                    className="flex-1 accent-primary"
                  />
                  <span className="w-8 text-center text-sm font-bold text-primary">{maxStages}</span>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">3~10단계 선택 가능. 기본값은 설정에서 변경할 수 있습니다.</p>
              </div>

              {/* Preview */}
              {name && (
                <div className={`flex items-center gap-3 rounded-2xl ${selectedColor} p-4`}>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-card/80">
                    {(() => {
                      const found = ICONS.find(i => i.key === selectedIcon)
                      const Icon = found?.Icon ?? BookOpen
                      return <Icon className="h-5 w-5 text-foreground" />
                    })()}
                  </div>
                  <span className="text-sm font-bold text-foreground">{name}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={!name.trim() || loading}
                className="rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground transition-transform active:scale-95 disabled:opacity-50"
              >
                {loading ? '추가 중...' : '카테고리 추가'}
              </button>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
