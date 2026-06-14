'use client'

import { Home, Trophy, User, Store } from 'lucide-react'
import { useNavigation, type Screen } from '@/lib/store'
import { cn } from '@/lib/utils'

const navItems: { label: string; icon: typeof Home; screen: Screen; activeTypes: Screen['type'][] }[] = [
  { label: '홈', icon: Home, screen: { type: 'dashboard' }, activeTypes: ['dashboard'] },
  { label: '마켓', icon: Store, screen: { type: 'marketplace' }, activeTypes: ['marketplace', 'marketplace-template', 'my-templates', 'marketplace-hashtag', 'marketplace-section', 'marketplace-author', 'marketplace-moderation'] },
  { label: '랭킹', icon: Trophy, screen: { type: 'ranking' }, activeTypes: ['ranking', 'ranking-moderation'] },
  { label: '프로필', icon: User, screen: { type: 'profile' }, activeTypes: ['profile'] },
]

export function BottomNav() {
  const { screen, navigate } = useNavigation()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-card/95 backdrop-blur-md" role="navigation" aria-label="Main navigation">
      <div className="mx-auto flex max-w-md items-center justify-around px-4 py-1.5 pb-[env(safe-area-inset-bottom)]">
        {navItems.map((item) => {
          const isActive = item.activeTypes.includes(screen.type)
          return (
            <button
              key={item.label}
              onClick={() => {
                // Already exactly on this root screen → no-op (avoid duplicate
                // history entries). From a sub-screen, still go to the root.
                if (screen.type === item.screen.type) return
                navigate(item.screen)
              }}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-2xl px-4 py-1.5 text-xs font-semibold transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <item.icon className={cn('h-4 w-4', isActive && 'stroke-[2.5]')} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
