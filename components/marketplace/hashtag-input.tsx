'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { suggestHashtags, normalizeTag, displayTag, type HashtagCount } from '@/lib/marketplace/hashtags'

interface HashtagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  max?: number
}

export function HashtagInput({ tags, onChange, max = 10 }: HashtagInputProps) {
  const [value, setValue] = useState('')
  const [suggestions, setSuggestions] = useState<HashtagCount[]>([])
  const [open, setOpen] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    const clean = normalizeTag(value)
    if (!clean) {
      setSuggestions([])
      return
    }
    debounce.current = setTimeout(async () => {
      const res = await suggestHashtags(clean)
      setSuggestions(res.filter((s) => !tags.includes(s.tag)))
      setOpen(true)
    }, 220)
    return () => {
      if (debounce.current) clearTimeout(debounce.current)
    }
  }, [value, tags])

  const addTag = (raw: string) => {
    const tag = normalizeTag(raw)
    if (!tag || tags.includes(tag) || tags.length >= max) return
    onChange([...tags, tag])
    setValue('')
    setSuggestions([])
    setOpen(false)
  }

  const removeTag = (tag: string) => onChange(tags.filter((t) => t !== tag))

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary"
          >
            {displayTag(tag)}
            <button type="button" onClick={() => removeTag(tag)} aria-label="해시태그 삭제">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      {tags.length < max && (
        <div className="relative mt-2">
          <div className="flex items-center rounded-xl border border-border bg-background px-3 py-2.5">
            <span className="text-sm font-semibold text-muted-foreground">#</span>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/^#/, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault()
                  addTag(value)
                }
              }}
              placeholder="영어, toeic ..."
              className="ml-1 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
            />
          </div>

          {open && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
              {suggestions.map((s) => (
                <button
                  key={s.tag}
                  type="button"
                  onClick={() => addTag(s.tag)}
                  className="flex w-full items-center justify-between px-3 py-2 text-sm text-foreground hover:bg-muted"
                >
                  <span className="font-medium text-primary">{displayTag(s.tag)}</span>
                  <span className="text-xs text-muted-foreground">{s.cnt}개</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">
        Enter로 추가. 같은 해시태그가 3개 이상이면 마켓 홈에 모아집니다.
      </p>
    </div>
  )
}
