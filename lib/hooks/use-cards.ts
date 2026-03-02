'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, type DBCard } from '../db'
import { uploadToGDrive } from '../sync'

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

/** Cards that belong to graduated (completed) stacks in this category */
export function useGraduatedCards(categoryId: string | undefined) {
  return useLiveQuery(
    async () => {
      if (!categoryId) return []
      const completedStacks = await db.stacks
        .where('categoryId').equals(categoryId)
        .filter(s => s.isCompleted)
        .toArray()
      const stackIds = completedStacks.map(s => s.id)
      if (stackIds.length === 0) return []
      const allCards = await db.cards.where('categoryId').equals(categoryId).toArray()
      return allCards.filter(c => stackIds.includes(c.stackId))
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
      let count = 0
      for (const s of stacks) {
        count += await db.cards.where('stackId').equals(s.id).count()
      }
      return count
    },
    [categoryId, stage]
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
  await uploadToGDrive().catch(() => {})
  return card
}

export async function updateCard(id: string, data: Partial<Pick<DBCard, 'front' | 'back'>>): Promise<void> {
  await db.cards.update(id, { ...data, updatedAt: Date.now() })
  await uploadToGDrive().catch(() => {})
}

export async function deleteCard(id: string): Promise<void> {
  await db.cards.delete(id)
  await uploadToGDrive().catch(() => {})
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
  await uploadToGDrive().catch(() => {})
  return cards
}

/**
 * Parse text into front/back pairs. One line per card.
 * Separator: tab, or first period (.) — e.g. "앞면. 뒷면"
 */
export function parseImportText(text: string): Array<{ front: string; back: string }> {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const results: Array<{ front: string; back: string }> = []

  for (const line of lines) {
    let front: string
    let back: string
    if (line.includes('\t')) {
      const parts = line.split('\t')
      if (parts.length >= 2) {
        front = parts[0].trim()
        back = parts.slice(1).join('\t').trim()
        results.push({ front, back })
      }
    } else {
      const dotIdx = line.indexOf('.')
      if (dotIdx >= 0) {
        front = line.slice(0, dotIdx).trim()
        back = line.slice(dotIdx + 1).trim()
        results.push({ front, back })
      }
    }
  }
  return results
}
