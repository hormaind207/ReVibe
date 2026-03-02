'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, today, type DBStack } from '../db'
import { getNextReviewDate, mergeEligibleStacks } from '../leitner'
import { uploadToGDrive } from '../sync'

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
      const list = await db.stacks.where('categoryId').equals(categoryId).toArray()
      // Normal stages: hide completed (graduated) stacks; they appear only in graduation view
      const filtered = list.filter(s => s.stage === stage && !s.isCompleted)
      // 복습일 임박한 순 (가장 빨리 복습해야 할 것이 위에)
      return filtered.sort((a, b) => (a.nextReviewDate || '').localeCompare(b.nextReviewDate || ''))
    },
    [categoryId, stage]
  )
}

export function useStackCountByStage(categoryId: string | undefined, stage: number) {
  return useLiveQuery(
    async () => {
      if (!categoryId) return 0
      const list = await db.stacks.where('categoryId').equals(categoryId).toArray()
      return list.filter(s => s.stage === stage && !s.isCompleted).length
    },
    [categoryId, stage]
  )
}

export function useTodayReviewStacks() {
  const t = today()
  return useLiveQuery(
    () => db.stacks.filter(s => !s.isCompleted && s.nextReviewDate <= t).toArray()
  )
}

export function useTodayReviewStacksForCategory(categoryId: string | undefined) {
  const t = today()
  return useLiveQuery(
    () => categoryId
      ? db.stacks
          .where('categoryId').equals(categoryId)
          .filter(s => !s.isCompleted && s.nextReviewDate <= t)
          .toArray()
      : Promise.resolve([] as DBStack[]),
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
  await uploadToGDrive().catch(() => {})
  return stack
}

export async function updateStack(id: string, data: Partial<Omit<DBStack, 'id' | 'createdAt'>>): Promise<void> {
  await db.stacks.update(id, { ...data, updatedAt: Date.now() })
  await uploadToGDrive().catch(() => {})
}

export async function deleteStack(id: string): Promise<void> {
  await db.transaction('rw', [db.stacks, db.cards], async () => {
    await db.cards.where('stackId').equals(id).delete()
    await db.stacks.delete(id)
  })
  await uploadToGDrive().catch(() => {})
}

export async function resetStack(id: string): Promise<void> {
  const stack = await db.stacks.get(id)
  if (!stack) return
  const { today: t } = await import('../db')
  const date = t()
  await db.stacks.update(id, {
    stage: 1,
    nextReviewDate: date,
    scheduledReviewDate: date,
    isCompleted: false,
    updatedAt: Date.now(),
  })
  await mergeEligibleStacks(stack.categoryId)
  await uploadToGDrive().catch(() => {})
}

export async function moveStackToStage(id: string, newStage: number, maxStages: number): Promise<void> {
  const stack = await db.stacks.get(id)
  if (!stack) return
  const { today: t } = await import('../db')
  const isCompleted = newStage > maxStages
  const stage = Math.min(newStage, maxStages)
  const date = stage === 1 ? t() : getNextReviewDate(stage)
  await db.stacks.update(id, {
    stage,
    nextReviewDate: date,
    scheduledReviewDate: date,
    isCompleted,
    updatedAt: Date.now(),
  })
  await mergeEligibleStacks(stack.categoryId)
  await uploadToGDrive().catch(() => {})
}

export async function moveCardToStack(cardId: string, targetStackId: string, targetCategoryId: string): Promise<void> {
  await db.cards.update(cardId, {
    stackId: targetStackId,
    categoryId: targetCategoryId,
    updatedAt: Date.now(),
  })
  await uploadToGDrive().catch(() => {})
}
