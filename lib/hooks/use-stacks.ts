'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, today, type DBStack } from '../db'
import { getNextReviewDate, mergeEligibleStacks } from '../leitner'
import { scheduleDriveSync } from '../sync/sync-engine'

/** Returns undefined while loading */
export function useStacks(categoryId: string | undefined) {
  return useLiveQuery(
    () => categoryId
      ? db.stacks.where('categoryId').equals(categoryId).sortBy('createdAt')
      : Promise.resolve([] as DBStack[]),
    [categoryId]
  )
}

export function useStack(stackId: string | undefined) {
  return useLiveQuery(() => (stackId ? db.stacks.get(stackId) : undefined), [stackId])
}

export function useStacksByStage(categoryId: string | undefined, stage: number) {
  return useLiveQuery(
    async () => {
      if (!categoryId) return []
      const list = await db.stacks
        .where('[categoryId+stage]')
        .equals([categoryId, stage])
        .toArray()
      const filtered = list.filter(s => !s.isCompleted)
      return filtered.sort((a, b) => (a.nextReviewDate || '').localeCompare(b.nextReviewDate || ''))
    },
    [categoryId, stage]
  )
}

export function useStageStackCounts(categoryId: string | undefined, stages: number[]) {
  return useLiveQuery(
    async () => {
      if (!categoryId || stages.length === 0) return {} as Record<number, number>
      const pairs = await Promise.all(
        stages.map(async (stage) => {
          const list = await db.stacks
            .where('[categoryId+stage]')
            .equals([categoryId, stage])
            .toArray()
          return [stage, list.filter((s) => !s.isCompleted).length] as const
        })
      )
      return Object.fromEntries(pairs) as Record<number, number>
    },
    [categoryId, stages.join(',')]
  )
}

export function useStackCountByStage(categoryId: string | undefined, stage: number) {
  const counts = useStageStackCounts(categoryId, categoryId ? [stage] : [])
  return counts?.[stage] ?? 0
}

export function useTodayReviewStacks() {
  return useLiveQuery(
    () => {
      // Compute today() inside the query so it stays correct on re-run
      // (avoids a date captured at mount going stale after midnight).
      const t = today()
      return db.stacks.filter(s => !s.isCompleted && s.stage >= 1 && s.nextReviewDate <= t).toArray()
    }
  )
}

export function useTodayReviewStacksForCategory(categoryId: string | undefined) {
  return useLiveQuery(
    () => {
      if (!categoryId) return Promise.resolve([] as DBStack[])
      const t = today()
      return db.stacks
        .where('categoryId').equals(categoryId)
        .filter(s => !s.isCompleted && s.stage >= 1 && s.nextReviewDate <= t)
        .toArray()
    },
    [categoryId]
  )
}

export function useGraduatedStacks(categoryId: string | undefined) {
  return useLiveQuery(
    () => categoryId
      ? db.stacks
          .where('categoryId').equals(categoryId)
          .filter(s => s.isCompleted)
          .toArray()
      : Promise.resolve([] as DBStack[]),
    [categoryId]
  )
}

export async function createStack(categoryId: string, stage: number = 1): Promise<DBStack> {
  const now = Date.now()
  // Stage 1 always gets tomorrow as review date (1-day interval from today)
  const date = getNextReviewDate(stage)
  const stack: DBStack = {
    id: generateId(),
    categoryId,
    stage,
    nextReviewDate: date,
    scheduledReviewDate: date,
    isCompleted: false,
    createdAt: now,
    updatedAt: now,
  }
  await db.stacks.add(stack)
  await mergeEligibleStacks(categoryId)
  scheduleDriveSync()
  return stack
}

export async function updateStack(id: string, data: Partial<Omit<DBStack, 'id' | 'createdAt'>>): Promise<void> {
  await db.stacks.update(id, { ...data, updatedAt: Date.now() })
  scheduleDriveSync()
}

export async function deleteStack(id: string): Promise<void> {
  await db.transaction('rw', [db.stacks, db.cards], async () => {
    await db.cards.where('stackId').equals(id).delete()
    await db.stacks.delete(id)
  })
  scheduleDriveSync()
}

export async function resetStack(id: string): Promise<void> {
  const stack = await db.stacks.get(id)
  if (!stack) return
  // Stage 1 is always scheduled for its interval (tomorrow), consistent with
  // new/failed cards — never "today".
  const date = getNextReviewDate(1)
  await db.stacks.update(id, {
    stage: 1,
    nextReviewDate: date,
    scheduledReviewDate: date,
    isCompleted: false,
    updatedAt: Date.now(),
  })
  await mergeEligibleStacks(stack.categoryId)
  scheduleDriveSync()
}

export async function moveStackToStage(id: string, newStage: number, maxStages: number): Promise<void> {
  const stack = await db.stacks.get(id)
  if (!stack) return
  const isCompleted = newStage > maxStages
  const stage = Math.min(newStage, maxStages)
  // Every stage (including stage 1 = tomorrow) follows its interval date.
  const date = getNextReviewDate(stage)
  await db.stacks.update(id, {
    stage,
    nextReviewDate: date,
    scheduledReviewDate: date,
    isCompleted,
    updatedAt: Date.now(),
  })
  await mergeEligibleStacks(stack.categoryId)
  scheduleDriveSync()
}

export async function moveCardToStack(cardId: string, targetStackId: string, targetCategoryId: string): Promise<void> {
  await db.cards.update(cardId, {
    stackId: targetStackId,
    categoryId: targetCategoryId,
    updatedAt: Date.now(),
  })
  scheduleDriveSync()
}
