import { db, today } from '@/lib/db'
import { getTodayReviewStacks } from '@/lib/leitner'

export interface TodayReviewCounts {
  dueDate: string
  stackCount: number
  cardCount: number
}

/** Count stacks and cards due for review today (local Dexie). */
export async function getTodayReviewCounts(): Promise<TodayReviewCounts> {
  const dueDate = today()
  const dueStacks = await getTodayReviewStacks()
  if (dueStacks.length === 0) {
    return { dueDate, stackCount: 0, cardCount: 0 }
  }
  const counts = await Promise.all(
    dueStacks.map((s) => db.cards.where('stackId').equals(s.id).count())
  )
  const cardCount = counts.reduce((sum, c) => sum + c, 0)
  return { dueDate, stackCount: dueStacks.length, cardCount }
}
