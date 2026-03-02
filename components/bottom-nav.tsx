'use client'

import { Home, BarChart3, User } from 'lucide-react'
import { useNavigation, type Screen } from '@/lib/store'
import { cn } from '@/lib/utils'

const navItems: { label: string; icon: typeof Home; screen: Screen }[] = [
  { label: '홈', icon: Home, screen: { type: 'dashboard' } },
  { label: '통계', icon: BarChart3, screen: { type: 'stats' } },
  { label: '프로필', icon: User, screen: { type: 'profile' } },
]

export function BottomNav() {
  const { screen, navigate } = useNavigation()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-card/95 backdrop-blur-md" role="navigation" aria-label="Main navigation">
      <div className="mx-auto flex max-w-md items-center justify-around px-4 py-1.5 pb-[env(safe-area-inset-bottom)]">
        {navItems.map((item) => {
          const isActive = screen.type === item.screen.type
          return (
            <button
              key={item.label}
              onClick={() => navigate(item.screen)}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-2xl px-6 py-1.5 text-xs font-semibold transition-colors',
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
