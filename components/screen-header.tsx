'use client'

import { ChevronLeft } from 'lucide-react'
import { useNavigation } from '@/lib/store'
import type { ReactNode } from 'react'

interface ScreenHeaderProps {
  title: string
  showBack?: boolean
  onBack?: () => void
  rightElement?: ReactNode
}

export function ScreenHeader({ title, showBack = false, onBack, rightElement }: ScreenHeaderProps) {
  const { goBack } = useNavigation()
  const handleBack = onBack ?? goBack

  return (
    <header className="sticky top-0 z-40 flex items-center gap-3 bg-background/90 px-4 py-3 backdrop-blur-md">
      {showBack && (
        <button
          onClick={handleBack}
          className="flex h-8 w-8 items-center justify-center rounded-2xl bg-card text-foreground shadow-sm transition-transform active:scale-95"
          aria-label="뒤로가기"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      <h1 className="flex-1 text-lg font-bold text-foreground text-balance">{title}</h1>
      {rightElement}
    </header>
  )
}
