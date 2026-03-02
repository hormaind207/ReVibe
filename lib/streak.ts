/**
 * Review streak (복습 스트릭): increment when user completes all due reviews for the day
 * or when there were no due stacks (free pass). Reset to 0 the next day if they didn't complete.
 * Only active when at least one non-graduated card exists.
 */

import { db, today, type DBStreakMeta } from './db'
import { addDays } from './leitner'
import { getTodayReviewStacks } from './leitner'
import { uploadToGDrive } from './sync'

const STREAK_META_ID = 'meta'

function yesterday(): string {
  return addDays(today(), -1)
}

/** True if there is at least one card in a non-completed (non-graduated) stack. */
export async function hasNonGraduatedCards(): Promise<boolean> {
  const nonCompletedStacks = await db.stacks.filter(s => !s.isCompleted).toArray()
  if (nonCompletedStacks.length === 0) return false
  const stackIds = new Set(nonCompletedStacks.map(s => s.id))
  const cards = await db.cards.toArray()
  return cards.some(c => stackIds.has(c.stackId))
}

export async function getStreakMeta(): Promise<{ currentStreak: number; lastSuccessDate: string | null }> {
  const row = await db.streakMeta.get(STREAK_META_ID)
  if (!row) return { currentStreak: 0, lastSuccessDate: null }
  return { currentStreak: row.currentStreak, lastSuccessDate: row.lastSuccessDate }
}

export async function updateStreakMeta(
  patch: { currentStreak?: number; lastSuccessDate?: string | null }
): Promise<void> {
  const current = await db.streakMeta.get(STREAK_META_ID)
  const next: DBStreakMeta = {
    id: STREAK_META_ID,
    currentStreak: patch.currentStreak ?? current?.currentStreak ?? 0,
    lastSuccessDate: patch.lastSuccessDate !== undefined ? patch.lastSuccessDate : (current?.lastSuccessDate ?? null),
  }
  await db.streakMeta.put(next)
}

/**
 * Mark today as a success and increment streak (or set to 1).
 * Idempotent: no-op if lastSuccessDate is already today.
 * Only updates when hasNonGraduatedCards() is true.
 */
export async function updateStreakOnDaySuccess(): Promise<void> {
  const hasNonGraduated = await hasNonGraduatedCards()
  if (!hasNonGraduated) return

  const meta = await getStreakMeta()
  const t = today()
  if (meta.lastSuccessDate === t) return

  const y = yesterday()
  const nextStreak = meta.lastSuccessDate === y ? meta.currentStreak + 1 : 1
  await updateStreakMeta({ currentStreak: nextStreak, lastSuccessDate: t })
  await uploadToGDrive().catch(() => {})
}

const STREAK_PROCESSED_DATE_KEY = 'streak_processed_date'

/**
 * Run once per day on app load: reset streak if yesterday was missed;
 * if today has no due stacks and user has non-graduated cards, grant free pass (increment streak).
 */
export async function processStreakOnAppOpen(): Promise<void> {
  if (typeof window === 'undefined') return
  const t = today()
  if (sessionStorage.getItem(STREAK_PROCESSED_DATE_KEY) === t) return
  sessionStorage.setItem(STREAK_PROCESSED_DATE_KEY, t)

  const y = yesterday()
  const meta = await getStreakMeta()

  if (meta.lastSuccessDate !== null && meta.lastSuccessDate < y) {
    await updateStreakMeta({ currentStreak: 0 })
  }

  const dueStacks = await getTodayReviewStacks()
  if (dueStacks.length === 0) {
    await updateStreakOnDaySuccess()
  }
}

/** Tier boundaries: 1–6, 7–13, 14–20, 21–29, 30–59, 60–99, 100–179, 180–364, 365+ */
export const STREAK_TIERS = [6, 13, 20, 29, 59, 99, 179, 364] as const

export interface StreakTierConfig {
  tierIndex: number
  label: string
  flameCount: number
  className: string
}

/** Get visual config for current streak (for dashboard UI). */
export function getStreakTierConfig(streak: number): StreakTierConfig {
  if (streak <= 0) {
    return { tierIndex: 0, label: '연속 0일', flameCount: 0, className: 'text-muted-foreground' }
  }
  let tierIndex = 0
  for (let i = 0; i < STREAK_TIERS.length; i++) {
    if (streak <= STREAK_TIERS[i]) {
      tierIndex = i
      break
    }
    tierIndex = i + 1
  }
  const labels: Record<number, string> = {
    0: '연속 N일',
    1: '1주 달성!',
    2: '2주 달성!',
    3: '3주 달성!',
    4: '1개월 달성!',
    5: '2개월 달성!',
    6: '100일 달성!',
    7: '반년 달성!',
    8: '1년 달성!',
  }
  const flameCounts = [1, 1, 2, 2, 3, 3, 3, 3, 3]
  const classNames = [
    'text-foreground',
    'text-amber-600 bg-amber-500/10 ring-1 ring-amber-500/30',
    'text-amber-600 bg-amber-500/15',
    'text-orange-600 bg-orange-500/15 shadow-sm',
    'text-amber-500 bg-amber-400/20',
    'text-amber-500 bg-amber-400/20 animate-pulse',
    'text-amber-400',
    'text-slate-400 border border-amber-500/50',
    'text-amber-400 font-bold',
  ]
  const label = tierIndex < 9 ? labels[tierIndex] ?? '연속 N일' : '1년 달성!'
  return {
    tierIndex,
    label: label.replace('N', String(streak)),
    flameCount: flameCounts[Math.min(tierIndex, 8)] ?? 1,
    className: classNames[Math.min(tierIndex, 8)] ?? classNames[0],
  }
}
