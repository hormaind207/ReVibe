'use client'

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'

export type Screen =
  | { type: 'dashboard' }
  | { type: 'category'; categoryId: string }
  | { type: 'stage'; categoryId: string; stage: number }
  | { type: 'stack'; categoryId: string; stackId: string }
  | { type: 'review'; categoryId: string; stackId: string }
  | { type: 'stats' }
  | { type: 'settings' }
  | { type: 'profile' }
  | { type: 'help' }

interface NavigationContextType {
  screen: Screen
  navigate: (screen: Screen) => void
  /** Navigate to stage list and drop stack/review from history so back goes to category. */
  navigateToStageReplacingStackFlow: (categoryId: string, stage: number) => void
  goBack: () => void
  history: Screen[]
}

const NavigationContext = createContext<NavigationContextType | null>(null)

function screenToHash(screen: Screen): string {
  switch (screen.type) {
    case 'dashboard': return '#/'
    case 'category': return `#/category/${screen.categoryId}`
    case 'stage': return `#/category/${screen.categoryId}/stage/${screen.stage}`
    case 'stack': return `#/category/${screen.categoryId}/stack/${screen.stackId}`
    case 'review': return `#/category/${screen.categoryId}/review/${screen.stackId}`
    case 'stats': return '#/stats'
    case 'settings': return '#/settings'
    case 'profile': return '#/profile'
    case 'help': return '#/help'
  }
}

function hashToScreen(hash: string): Screen {
  const path = hash.replace(/^#/, '') || '/'

  const reviewMatch = path.match(/^\/category\/([^/]+)\/review\/([^/]+)$/)
  if (reviewMatch) return { type: 'review', categoryId: reviewMatch[1], stackId: reviewMatch[2] }

  const stackMatch = path.match(/^\/category\/([^/]+)\/stack\/([^/]+)$/)
  if (stackMatch) return { type: 'stack', categoryId: stackMatch[1], stackId: stackMatch[2] }

  const stageMatch = path.match(/^\/category\/([^/]+)\/stage\/(\d+)$/)
  if (stageMatch) return { type: 'stage', categoryId: stageMatch[1], stage: Number(stageMatch[2]) }

  const categoryMatch = path.match(/^\/category\/([^/]+)$/)
  if (categoryMatch) return { type: 'category', categoryId: categoryMatch[1] }

  if (path === '/stats') return { type: 'stats' }
  if (path === '/settings') return { type: 'settings' }
  if (path === '/profile') return { type: 'profile' }
  if (path === '/help') return { type: 'help' }

  return { type: 'dashboard' }
}

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<Screen[]>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash
      if (hash && hash !== '#/') {
        return [{ type: 'dashboard' }, hashToScreen(hash)]
      }
    }
    return [{ type: 'dashboard' }]
  })

  const screen = history[history.length - 1]
  const historyRef = useRef(history)
  historyRef.current = history

  // Sync hash → state on browser back/forward
  useEffect(() => {
    const onPopState = () => {
      const s = hashToScreen(window.location.hash)
      setHistory([{ type: 'dashboard' }, s])
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback((newScreen: Screen) => {
    const hash = screenToHash(newScreen)
    window.history.pushState(null, '', hash)
    setHistory(prev => [...prev, newScreen])
  }, [])

  const navigateToStageReplacingStackFlow = useCallback((categoryId: string, stage: number) => {
    const newScreen: Screen = { type: 'stage', categoryId, stage }
    const hash = screenToHash(newScreen)
    window.history.replaceState(null, '', hash)
    setHistory(prev => {
      const idx = prev.findIndex(s => s.type === 'category' && s.categoryId === categoryId)
      const base = idx >= 0 ? prev.slice(0, idx + 1) : prev
      return [...base, newScreen]
    })
  }, [])

  const goBack = useCallback(() => {
    const prev = historyRef.current
    if (prev.length <= 1) return
    const next = prev.slice(0, -1)
    const hash = screenToHash(next[next.length - 1])
    window.history.replaceState(null, '', hash)
    setHistory(next)
  }, [])

  return (
    <NavigationContext.Provider value={{ screen, navigate, navigateToStageReplacingStackFlow, goBack, history }}>
      {children}
    </NavigationContext.Provider>
  )
}

export function useNavigation() {
  const ctx = useContext(NavigationContext)
  if (!ctx) throw new Error('useNavigation must be used within NavigationProvider')
  return ctx
}
