'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { parseImportText as parseImportTextFull } from '../import-cards'
import { db, generateId, type DBCard } from '../db'
import { scheduleDriveSync } from '../sync/sync-engine'
import { WAITING_STAGE, getOrCreateTomorrowStack, mergeEligibleStacks } from '../leitner'

/** Returns undefined while loading */
export function useCards(stackId: string | undefined) {
  return useLiveQuery(
    () => stackId
      ? db.cards.where('stackId').equals(stackId).sortBy('createdAt')
      : Promise.resolve([] as DBCard[]),
    [stackId]
  )
}

export function useCard(cardId: string | undefined) {
  return useLiveQuery(() => (cardId ? db.cards.get(cardId) : undefined), [cardId])
}

export function useCardCount(stackId: string | undefined) {
  return useLiveQuery(
    () => stackId ? db.cards.where('stackId').equals(stackId).count() : Promise.resolve(0),
    [stackId]
  )
}

export function useCategoryCardCount(categoryId: string | undefined) {
  return useLiveQuery(
    () => categoryId ? db.cards.where('categoryId').equals(categoryId).count() : Promise.resolve(0),
    [categoryId]
  )
}

export function useStackCardCounts(stackIds: string[]) {
  return useLiveQuery(
    async () => {
      if (!stackIds.length) return {} as Record<string, number>
      const pairs = await Promise.all(
        stackIds.map((id) =>
          db.cards.where('stackId').equals(id).count().then((n) => [id, n] as const)
        )
      )
      return Object.fromEntries(pairs) as Record<string, number>
    },
    [stackIds.join(',')]
  )
}

/** Waiting cards + count in one live query. */
export function useWaitingStats(categoryId: string | undefined) {
  return useLiveQuery(
    async () => {
      if (!categoryId) return { cards: [] as DBCard[], count: 0 }
      const waitingStacks = await db.stacks
        .where('categoryId')
        .equals(categoryId)
        .filter((s) => s.stage === WAITING_STAGE)
        .toArray()
      if (waitingStacks.length === 0) return { cards: [] as DBCard[], count: 0 }
      const waitingIds = waitingStacks.map((s) => s.id)
      const cards =
        waitingIds.length === 1
          ? await db.cards.where('stackId').equals(waitingIds[0]).toArray()
          : await db.cards.where('stackId').anyOf(waitingIds).toArray()
      cards.sort((a, b) => a.createdAt - b.createdAt)
      return { cards, count: cards.length }
    },
    [categoryId]
  )
}

/** Cards that belong to the waiting stack (stage 0) of this category. */
export function useWaitingCards(categoryId: string | undefined) {
  const stats = useWaitingStats(categoryId)
  return stats?.cards
}

export function useWaitingCardCount(categoryId: string | undefined) {
  const stats = useWaitingStats(categoryId)
  return stats?.count ?? 0
}

/**
 * Promote selected waiting cards into a tomorrow stage-1 stack (joins the review flow).
 */
export async function promoteCardsToStage1(categoryId: string, cardIds: string[]): Promise<void> {
  if (cardIds.length === 0) return
  const targetStackId = await getOrCreateTomorrowStack(categoryId)
  const now = Date.now()
  await db.transaction('rw', [db.cards], async () => {
    for (const id of cardIds) {
      await db.cards.update(id, { stackId: targetStackId, categoryId, updatedAt: now })
    }
  })
  await mergeEligibleStacks(categoryId)
  scheduleDriveSync()
}

/** Cards that belong to graduated (completed) stacks in this category */
export function useGraduatedCards(categoryId: string | undefined) {
  return useLiveQuery(
    async () => {
      if (!categoryId) return []
      const completedStacks = await db.stacks
        .where('categoryId').equals(categoryId)
        .filter(s => s.isCompleted)
        .toArray()
      const stackIdSet = new Set(completedStacks.map(s => s.id))
      if (stackIdSet.size === 0) return []
      const allCards = await db.cards.where('categoryId').equals(categoryId).toArray()
      return allCards.filter(c => stackIdSet.has(c.stackId))
    },
    [categoryId]
  )
}

export function useTotalCardCount() {
  return useLiveQuery(() => db.cards.count())
}

export function useStageCardCount(categoryId: string | undefined, stage: number) {
  return useLiveQuery(
    async () => {
      if (!categoryId) return 0
      const stacks = await db.stacks
        .where('[categoryId+stage]')
        .equals([categoryId, stage])
        .toArray()
      if (stacks.length === 0) return 0
      const counts = await Promise.all(stacks.map(s => db.cards.where('stackId').equals(s.id).count()))
      return counts.reduce((sum, c) => sum + c, 0)
    },
    [categoryId, stage]
  )
}

export function useCategoryCardCounts(categoryIds: string[]) {
  return useLiveQuery(
    async () => {
      if (!categoryIds.length) return {} as Record<string, number>
      const pairs = await Promise.all(
        categoryIds.map(id => db.cards.where('categoryId').equals(id).count().then(n => [id, n] as const))
      )
      return Object.fromEntries(pairs) as Record<string, number>
    },
    [categoryIds.join(',')]
  )
}

export async function createCard(data: Pick<DBCard, 'stackId' | 'categoryId' | 'front' | 'back'>): Promise<DBCard> {
  const now = Date.now()
  const card: DBCard = {
    ...data,
    id: generateId(),
    lastReviewed: null,
    createdAt: now,
    updatedAt: now,
  }
  await db.cards.add(card)
  scheduleDriveSync()
  return card
}

export async function updateCard(id: string, data: Partial<Pick<DBCard, 'front' | 'back'>>): Promise<void> {
  await db.cards.update(id, { ...data, updatedAt: Date.now() })
  scheduleDriveSync()
}

export async function deleteCard(id: string): Promise<void> {
  await db.cards.delete(id)
  scheduleDriveSync()
}

/**
 * Bulk import cards into a stack from parsed CSV/text data.
 */
export async function bulkImportCards(
  stackId: string,
  categoryId: string,
  entries: Array<{ front: string; back: string }>
): Promise<DBCard[]> {
  const now = Date.now()
  const cards: DBCard[] = entries
    .filter(e => e.front.trim() && e.back.trim())
    .map(e => ({
      id: generateId(),
      stackId,
      categoryId,
      front: e.front.trim(),
      back: e.back.trim(),
      lastReviewed: null,
      createdAt: now,
      updatedAt: now,
    }))
  await db.cards.bulkAdd(cards)
  scheduleDriveSync()
  return cards
}

/**
 * @deprecated Use parseImportText from '@/lib/import-cards' for full result with errors.
 * Returns only successfully parsed cards.
 */
export function parseImportText(text: string): Array<{ front: string; back: string }> {
  return parseImportTextFull(text).cards
}
