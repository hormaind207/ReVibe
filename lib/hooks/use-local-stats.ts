'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db, today } from '../db'
import { STAGES } from '../types'

export interface LocalStats {
  totalCards: number
  totalCategories: number
  totalStacks: number
  todayCount: number
}

export interface ExtendedLocalStats extends LocalStats {
  graduatedCount: number
  graduatedCards: number
  stageDistribution: { stage: number; count: number }[]
}

const EMPTY_STAGE_DIST = STAGES.map((s) => ({ stage: s.stage, count: 0 }))

const DEFAULT_EXTENDED: ExtendedLocalStats = {
  totalCards: 0,
  totalCategories: 0,
  totalStacks: 0,
  todayCount: 0,
  graduatedCount: 0,
  graduatedCards: 0,
  stageDistribution: EMPTY_STAGE_DIST,
}

async function computeExtendedLocalStats(): Promise<ExtendedLocalStats> {
  const t = today()
  return db.transaction('r', [db.categories, db.stacks, db.cards], async () => {
    const [totalCategories, allStacks, totalCardCount, waitingStacks] = await Promise.all([
      db.categories.count(),
      db.stacks.toArray(),
      db.cards.count(),
      db.stacks.filter((s) => s.stage === 0).toArray(),
    ])

    const waitingIds = waitingStacks.map((s) => s.id)
    let waitingCardCount = 0
    if (waitingIds.length === 1) {
      waitingCardCount = await db.cards.where('stackId').equals(waitingIds[0]).count()
    } else if (waitingIds.length > 1) {
      waitingCardCount = await db.cards.where('stackId').anyOf(waitingIds).count()
    }

    const totalCards = totalCardCount - waitingCardCount
    const totalStacks = allStacks.filter((s) => s.stage >= 1 && !s.isCompleted).length

    const dueStacks = allStacks.filter(
      (s) => !s.isCompleted && s.stage >= 1 && s.nextReviewDate <= t
    )
    let todayCount = 0
    if (dueStacks.length > 0) {
      const counts = await Promise.all(
        dueStacks.map((s) => db.cards.where('stackId').equals(s.id).count())
      )
      todayCount = counts.reduce((sum, c) => sum + c, 0)
    }

    const completedStacks = allStacks.filter((s) => s.isCompleted)
    const graduatedCount = completedStacks.length
    let graduatedCards = 0
    if (completedStacks.length > 0) {
      const counts = await Promise.all(
        completedStacks.map((s) => db.cards.where('stackId').equals(s.id).count())
      )
      graduatedCards = counts.reduce((sum, c) => sum + c, 0)
    }

    const stageDistribution = await Promise.all(
      STAGES.map(async ({ stage }) => {
        const stacks = allStacks.filter((s) => s.stage === stage && !s.isCompleted)
        if (stacks.length === 0) return { stage, count: 0 }
        const counts = await Promise.all(
          stacks.map((s) => db.cards.where('stackId').equals(s.id).count())
        )
        return { stage, count: counts.reduce((sum, c) => sum + c, 0) }
      })
    )

    return {
      totalCards,
      totalCategories,
      totalStacks,
      todayCount,
      graduatedCount,
      graduatedCards,
      stageDistribution,
    }
  })
}

/** Single Dexie observer for home/stats/ranking counters. */
export function useExtendedLocalStats(): ExtendedLocalStats {
  return useLiveQuery(() => computeExtendedLocalStats(), [], DEFAULT_EXTENDED) ?? DEFAULT_EXTENDED
}

export function useLocalStats(): LocalStats {
  const stats = useExtendedLocalStats()
  return {
    totalCards: stats.totalCards,
    totalCategories: stats.totalCategories,
    totalStacks: stats.totalStacks,
    todayCount: stats.todayCount,
  }
}
