'use client'

import { createCategory } from '@/lib/hooks/use-categories'
import { bulkImportCards } from '@/lib/hooks/use-cards'
import { getOrCreateWaitingStack, getOrCreateTomorrowStack } from '@/lib/leitner'
import type { TemplateDetail, TemplateCardRow } from './templates'

const FALLBACK_COLOR = 'bg-[#e8d5f5]/40'

export type CardDestination = 'stage1' | 'waiting'

/**
 * Add an entire template as a new local category. All cards go to the waiting
 * stage. If the template has an image background it is preserved.
 */
export async function importTemplateAsCategory(template: TemplateDetail): Promise<string> {
  const category = await createCategory({
    name: template.name,
    icon: template.icon,
    color: template.color ?? FALLBACK_COLOR,
    backgroundImage: template.imageUrl ?? undefined,
  })
  const stackId = await getOrCreateWaitingStack(category.id)
  await bulkImportCards(
    stackId,
    category.id,
    template.cards.map((c) => ({ front: c.front, back: c.back }))
  )
  return category.id
}

/**
 * Add selected cards from a template into an existing local category, into
 * either the stage-1 (tomorrow) stack or the waiting pool.
 */
export async function importCardsToCategory(
  cards: TemplateCardRow[],
  categoryId: string,
  destination: CardDestination
): Promise<number> {
  if (cards.length === 0) return 0
  const stackId =
    destination === 'waiting'
      ? await getOrCreateWaitingStack(categoryId)
      : await getOrCreateTomorrowStack(categoryId)
  const added = await bulkImportCards(
    stackId,
    categoryId,
    cards.map((c) => ({ front: c.front, back: c.back }))
  )
  return added.length
}
