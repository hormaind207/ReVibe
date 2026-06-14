import { db, toDateString, type DBCard, type DBCategory, type DBStack } from './db'
import { WAITING_STAGE } from './leitner'
import { STAGES } from './types'

export function normalizeFront(front: string): string {
  return front.trim()
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
}

export function getStackDisplayName(stack: DBStack): string {
  if (stack.name?.trim()) return stack.name.trim()
  const dateStr = stack.createdAt ? toDateString(new Date(stack.createdAt)) : stack.nextReviewDate
  return `${formatDate(dateStr)} 스택`
}

export function getStackStageLabel(stack: DBStack, category?: DBCategory | null): string {
  if (stack.stage === WAITING_STAGE) return '대기'
  if (stack.isCompleted) return '졸업'
  const custom = category?.stageLabels?.[stack.stage]
  if (custom?.trim()) return custom.trim()
  const stageInfo = STAGES.find(s => s.stage === stack.stage)
  return stageInfo ? `${stack.stage}단계` : `${stack.stage}단계`
}

export function getCardLocationLabel(stack: DBStack, category?: DBCategory | null): string {
  const stage = getStackStageLabel(stack, category)
  if (stack.stage === WAITING_STAGE || stack.isCompleted) return stage
  return `${stage} · ${getStackDisplayName(stack)}`
}

export interface DuplicateMatch {
  card: DBCard
  stack: DBStack
  stageLabel: string
  stackDisplayName: string
  locationLabel: string
  /** True when match is from the current bulk batch, not yet in DB */
  isPendingBatch?: boolean
}

export interface CategoryCardSearchResult {
  card: DBCard
  stack: DBStack
  stageLabel: string
  stackDisplayName: string
  locationLabel: string
  matchedField: 'front' | 'back' | 'both'
}

async function loadCategoryStacksMap(categoryId: string): Promise<Map<string, DBStack>> {
  const stacks = await db.stacks.where('categoryId').equals(categoryId).toArray()
  return new Map(stacks.map(s => [s.id, s]))
}

export async function findCardsWithSameFront(
  categoryId: string,
  front: string,
  category?: DBCategory | null
): Promise<DuplicateMatch[]> {
  const normalized = normalizeFront(front)
  if (!normalized) return []

  const [cards, stackMap] = await Promise.all([
    db.cards.where('categoryId').equals(categoryId).toArray(),
    loadCategoryStacksMap(categoryId),
  ])

  const cat = category ?? (await db.categories.get(categoryId))

  return cards
    .filter(c => normalizeFront(c.front) === normalized)
    .map(card => {
      const stack = stackMap.get(card.stackId)
      if (!stack) {
        return null
      }
      return {
        card,
        stack,
        stageLabel: getStackStageLabel(stack, cat),
        stackDisplayName: getStackDisplayName(stack),
        locationLabel: getCardLocationLabel(stack, cat),
      }
    })
    .filter((m): m is DuplicateMatch => m !== null)
}

export async function searchCategoryCards(
  categoryId: string,
  query: string,
  category?: DBCategory | null
): Promise<CategoryCardSearchResult[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const [cards, stackMap] = await Promise.all([
    db.cards.where('categoryId').equals(categoryId).toArray(),
    loadCategoryStacksMap(categoryId),
  ])

  const cat = category ?? (await db.categories.get(categoryId))
  const results: CategoryCardSearchResult[] = []

  for (const card of cards) {
    const frontMatch = card.front.toLowerCase().includes(q)
    const backMatch = card.back.toLowerCase().includes(q)
    if (!frontMatch && !backMatch) continue

    const stack = stackMap.get(card.stackId)
    if (!stack) continue

    results.push({
      card,
      stack,
      stageLabel: getStackStageLabel(stack, cat),
      stackDisplayName: getStackDisplayName(stack),
      locationLabel: getCardLocationLabel(stack, cat),
      matchedField: frontMatch && backMatch ? 'both' : frontMatch ? 'front' : 'back',
    })
  }

  return results.sort((a, b) => a.card.front.localeCompare(b.card.front, 'ko'))
}
