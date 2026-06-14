'use client'

import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo, type ReactNode } from 'react'

export type Screen =
  | { type: 'dashboard' }
  | { type: 'category'; categoryId: string }
  | { type: 'stage'; categoryId: string; stage: number }
  | { type: 'stack'; categoryId: string; stackId: string }
  | { type: 'review'; categoryId: string; stackId: string }
  | { type: 'study'; categoryId: string; stackId: string; random?: boolean }
  | { type: 'stats' }
  | { type: 'ranking' }
  | { type: 'ranking-moderation' }
  | { type: 'settings' }
  | { type: 'profile' }
  | { type: 'help' }
  | { type: 'marketplace' }
  | { type: 'marketplace-template'; templateId: string }
  | { type: 'my-templates' }
  | { type: 'marketplace-hashtag'; tag: string }
  | { type: 'marketplace-section'; section: 'favorites' | 'popular' | 'official' }
  | { type: 'marketplace-author'; ownerId: string }
  | { type: 'marketplace-moderation' }
  | { type: 'bug-reports-admin' }

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
    case 'study': return `#/category/${screen.categoryId}/study/${screen.stackId}`
    case 'stats': return '#/stats'
    case 'ranking': return '#/ranking'
    case 'ranking-moderation': return '#/ranking/moderation'
    case 'settings': return '#/settings'
    case 'profile': return '#/profile'
    case 'help': return '#/help'
    case 'marketplace': return '#/marketplace'
    case 'marketplace-template': return `#/marketplace/template/${screen.templateId}`
    case 'my-templates': return '#/marketplace/mine'
    case 'marketplace-hashtag': return `#/marketplace/tag/${encodeURIComponent(screen.tag)}`
    case 'marketplace-section': return `#/marketplace/${screen.section}`
    case 'marketplace-author': return `#/marketplace/author/${screen.ownerId}`
    case 'marketplace-moderation': return '#/marketplace/moderation'
    case 'bug-reports-admin': return '#/admin/bug-reports'
  }
}

function hashToScreen(hash: string): Screen {
  const path = hash.replace(/^#/, '') || '/'

  const studyMatch = path.match(/^\/category\/([^/]+)\/study\/([^/]+)$/)
  if (studyMatch) return { type: 'study', categoryId: studyMatch[1], stackId: studyMatch[2] }

  const reviewMatch = path.match(/^\/category\/([^/]+)\/review\/([^/]+)$/)
  if (reviewMatch) return { type: 'review', categoryId: reviewMatch[1], stackId: reviewMatch[2] }

  const stackMatch = path.match(/^\/category\/([^/]+)\/stack\/([^/]+)$/)
  if (stackMatch) return { type: 'stack', categoryId: stackMatch[1], stackId: stackMatch[2] }

  const stageMatch = path.match(/^\/category\/([^/]+)\/stage\/(\d+)$/)
  if (stageMatch) return { type: 'stage', categoryId: stageMatch[1], stage: Number(stageMatch[2]) }

  const categoryMatch = path.match(/^\/category\/([^/]+)$/)
  if (categoryMatch) return { type: 'category', categoryId: categoryMatch[1] }

  const templateMatch = path.match(/^\/marketplace\/template\/([^/]+)$/)
  if (templateMatch) return { type: 'marketplace-template', templateId: templateMatch[1] }

  const hashtagMatch = path.match(/^\/marketplace\/tag\/([^/]+)$/)
  if (hashtagMatch) return { type: 'marketplace-hashtag', tag: decodeURIComponent(hashtagMatch[1]) }

  if (path === '/marketplace/favorites') return { type: 'marketplace-section', section: 'favorites' }
  if (path === '/marketplace/popular') return { type: 'marketplace-section', section: 'popular' }
  if (path === '/marketplace/official') return { type: 'marketplace-section', section: 'official' }

  const authorMatch = path.match(/^\/marketplace\/author\/([^/]+)$/)
  if (authorMatch) return { type: 'marketplace-author', ownerId: authorMatch[1] }

  if (path === '/marketplace/moderation') return { type: 'marketplace-moderation' }
  if (path === '/admin/bug-reports') return { type: 'bug-reports-admin' }
  if (path === '/marketplace/mine') return { type: 'my-templates' }
  if (path === '/marketplace') return { type: 'marketplace' }

  if (path === '/stats') return { type: 'stats' }
  if (path === '/ranking/moderation') return { type: 'ranking-moderation' }
  if (path === '/ranking') return { type: 'ranking' }
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

  // Sync hash → state on browser back/forward without flattening the in-app
  // history (which would make later "back" jumps skip intermediate screens).
  useEffect(() => {
    const onPopState = () => {
      const s = hashToScreen(window.location.hash)
      const targetHash = screenToHash(s)
      setHistory(prev => {
        // Normal back: target equals the previous entry → pop one level.
        if (prev.length >= 2 && screenToHash(prev[prev.length - 2]) === targetHash) {
          return prev.slice(0, -1)
        }
        // Target already somewhere in the stack → truncate to it.
        const idx = prev.map(screenToHash).lastIndexOf(targetHash)
        if (idx >= 0) return prev.slice(0, idx + 1)
        // Unknown target (forward nav / deep link) → minimal rebuild.
        return [{ type: 'dashboard' }, s]
      })
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

  const contextValue = useMemo(
    () => ({
      screen,
      navigate,
      navigateToStageReplacingStackFlow,
      goBack,
      history,
    }),
    [screen, navigate, navigateToStageReplacingStackFlow, goBack, history]
  )

  return (
    <NavigationContext.Provider value={contextValue}>
      {children}
    </NavigationContext.Provider>
  )
}

export function useNavigation() {
  const ctx = useContext(NavigationContext)
  if (!ctx) throw new Error('useNavigation must be used within NavigationProvider')
  return ctx
}
