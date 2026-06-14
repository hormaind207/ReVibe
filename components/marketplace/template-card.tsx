'use client'

import { Heart, Layers, BookOpen, BadgeCheck } from 'lucide-react'
import { useNavigation } from '@/lib/store'
import { ICON_MAP } from '@/components/screens/dashboard'
import type { TemplateSummary } from '@/lib/marketplace/templates'

interface TemplateCardProps {
  template: TemplateSummary
  onClick: () => void
  compact?: boolean
}

export function TemplateCard({ template, onClick, compact = false }: TemplateCardProps) {
  const { navigate } = useNavigation()
  const Icon = ICON_MAP[template.icon] || BookOpen
  const hasImage = Boolean(template.imageUrl)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className={`relative flex cursor-pointer flex-col overflow-hidden rounded-2xl p-4 text-left shadow-sm transition-transform active:scale-95 ${
        hasImage ? 'bg-card' : template.color ?? 'bg-muted'
      } ${compact ? 'min-w-[150px] max-w-[150px] flex-shrink-0' : 'w-full'}`}
      style={hasImage ? { backgroundImage: `url(${template.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
    >
      {hasImage && <span className="absolute inset-0 bg-black/40" aria-hidden />}
      <div className="relative flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-card/85 shadow-sm">
          <Icon className="h-5 w-5 text-foreground" />
        </div>
        {template.favorited && <span className="text-xs">⭐</span>}
      </div>
      <p className={`relative mt-3 line-clamp-2 text-sm font-bold ${hasImage ? 'text-white' : 'text-foreground'}`}>
        {template.name}
      </p>
      <span
        role={template.isOfficial ? undefined : 'link'}
        tabIndex={template.isOfficial ? undefined : 0}
        onClick={template.isOfficial ? undefined : (e) => {
          e.stopPropagation()
          navigate({ type: 'marketplace-author', ownerId: template.ownerId })
        }}
        onKeyDown={template.isOfficial ? undefined : (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            e.stopPropagation()
            navigate({ type: 'marketplace-author', ownerId: template.ownerId })
          }
        }}
        className={`relative mt-0.5 flex items-center gap-1 text-left text-[11px] ${template.isOfficial ? '' : 'cursor-pointer underline-offset-2 hover:underline'} ${hasImage ? 'text-white/80' : 'text-muted-foreground'}`}
      >
        {template.nickname}
        {template.isOfficial && (
          <BadgeCheck className="h-3.5 w-3.5 flex-shrink-0 text-primary" aria-label="공식" />
        )}
        {!template.isOfficial && (template.ownerTrophyCount ?? 0) > 0 && (
          <span className="inline-flex items-center rounded-full bg-amber-500/20 px-1 py-0.5 text-[9px] font-bold text-amber-600 no-underline">
            🏆{template.ownerTrophyCount}
          </span>
        )}
      </span>
      <div className={`relative mt-2 flex items-center gap-3 text-[11px] ${hasImage ? 'text-white/90' : 'text-muted-foreground'}`}>
        <span className="flex items-center gap-1">
          <Heart className={`h-3.5 w-3.5 ${template.liked ? 'fill-red-500 text-red-500' : ''}`} />
          {template.likeCount}
        </span>
        <span className="flex items-center gap-1">
          <Layers className="h-3.5 w-3.5" />
          {template.cardCount}
        </span>
      </div>
    </div>
  )
}
