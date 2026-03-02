'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateId, type DBCategory } from '../db'
import { uploadToGDrive } from '../sync'

/** Returns undefined while loading, DBCategory[] once ready */
export function useCategories() {
  return useLiveQuery(() => db.categories.orderBy('createdAt').toArray())
}

/** Returns undefined while loading */
export function useCategory(id: string | undefined) {
  return useLiveQuery(() => (id ? db.categories.get(id) : undefined), [id])
}

export async function createCategory(data: Omit<DBCategory, 'id' | 'createdAt' | 'updatedAt'>): Promise<DBCategory> {
  const now = Date.now()
  const category: DBCategory = {
    ...data,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  }
  await db.categories.add(category)
  await uploadToGDrive().catch(() => {})
  return category
}

export async function updateCategory(id: string, data: Partial<Omit<DBCategory, 'id' | 'createdAt'>>): Promise<void> {
  await db.categories.update(id, { ...data, updatedAt: Date.now() })
  await uploadToGDrive().catch(() => {})
}

export async function deleteCategory(id: string): Promise<void> {
  await db.transaction('rw', [db.categories, db.stacks, db.cards], async () => {
    const stacks = await db.stacks.where('categoryId').equals(id).toArray()
    for (const stack of stacks) {
      await db.cards.where('stackId').equals(stack.id).delete()
    }
    await db.stacks.where('categoryId').equals(id).delete()
    await db.categories.delete(id)
  })
  await uploadToGDrive().catch(() => {})
}
