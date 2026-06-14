'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, ChevronRight } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigation } from '@/lib/store'
import { searchCategoryCards } from '@/lib/card-lookup'
import { WAITING_STAGE } from '@/lib/leitner'
import type { DBCategory } from '@/lib/db'

interface CategoryCardSearchModalProps {
  open: boolean
  onClose: () => void
  categoryId: string
  category: DBCategory
}

export function CategoryCardSearchModal({
  open,
  onClose,
  categoryId,
  category,
}: CategoryCardSearchModalProps) {
  const { navigate } = useNavigation()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  useEffect(() => {
    if (!open) {
      setQuery('')
      setDebouncedQuery('')
      return
    }
    const t = setTimeout(() => setDebouncedQuery(query), 200)
    return () => clearTimeout(t)
  }, [query, open])

  const results = useLiveQuery(
    () =>
      debouncedQuery.trim()
        ? searchCategoryCards(categoryId, debouncedQuery, category)
        : Promise.resolve([]),
    [categoryId, debouncedQuery, category]
  )

  const handleSelect = (stackId: string, stage: number, isCompleted: boolean) => {
    onClose()
    if (stage === WAITING_STAGE) {
      navigate({ type: 'stage', categoryId, stage: 0 })
    } else if (isCompleted) {
      navigate({ type: 'stage', categoryId, stage: 99 })
    } else {
      navigate({ type: 'stack', categoryId, stackId })
    }
  }

  const matchLabel = (field: 'front' | 'back' | 'both') => {
    if (field === 'both') return '앞·뒷면 일치'
    if (field === 'front') return '앞면 일치'
    return '뒷면 일치'
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="search-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            key="search-modal"
            initial={{ opacity: 0, y: 80 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 80 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="fixed bottom-0 left-0 right-0 z-[60] mx-auto flex max-h-[85vh] max-w-md flex-col rounded-t-3xl bg-card shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-border p-4">
              <h2 className="text-lg font-bold text-foreground">카드 검색</h2>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground"
                aria-label="닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-4 pt-3 pb-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="앞면 또는 뒷면 검색"
                  autoFocus
                  className="w-full rounded-xl border border-border bg-background py-3 pl-10 pr-4 text-sm font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {category.name} 카테고리 안에서 검색합니다
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-6">
              {!debouncedQuery.trim() ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <Search className="h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">검색어를 입력하세요</p>
                </div>
              ) : results === undefined ? (
                <div className="py-10 text-center text-sm text-muted-foreground">검색 중...</div>
              ) : results.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  &quot;{debouncedQuery}&quot;와 일치하는 카드가 없습니다
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold text-muted-foreground">{results.length}개 결과</p>
                  {results.map(({ card, stack, locationLabel, matchedField }) => (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => handleSelect(stack.id, stack.stage, stack.isCompleted)}
                      className="flex items-start gap-3 rounded-2xl bg-muted/60 px-4 py-3 text-left transition-colors hover:bg-muted active:scale-[0.99]"
                    >
                      <div className="flex flex-1 min-w-0 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            {locationLabel}
                          </span>
                          <span className="rounded-full bg-card px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {matchLabel(matchedField)}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-foreground line-clamp-2 whitespace-pre-line">
                          {card.front}
                        </p>
                        <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-line">
                          {card.back}
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground mt-1" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
