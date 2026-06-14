import { db, generateId, today, toDateString, type DBStack, type DBCard } from './db'
import { scheduleDriveSync } from './sync/sync-engine'

// Stage intervals in days (default values, can be overridden per category)
export const STAGE_INTERVALS: Record<number, number> = {
  1: 1,
  2: 2,
  3: 7,
  4: 14,
  5: 30,
  6: 30,
  7: 30,
  8: 120,
  9: 180,
  10: 365,
}

// Stack merge tolerance in days (0 = same date only, null = no merging)
export const MERGE_TOLERANCE: Record<number, number | null> = {
  1: 0,  // always merge stage 1 stacks with same date
  2: 0,  // merge stage 2 stacks with same date
  3: 2,
  4: 2,
  5: 7,
  6: 7,
  7: 7,
  8: 14,
  9: 14,
  10: 30,
}

export const MAX_STAGE = 7
export const DEFAULT_MAX_STAGES = 7

/** Sentinel stage for the per-category "waiting" pool (not part of the Leitner flow). */
export const WAITING_STAGE = 0

/**
 * Get or create the single stage-1 stack scheduled for tomorrow (for new/promoted cards).
 * Reuses an existing matching stack to keep stage 1 tidy.
 */
export async function getOrCreateTomorrowStack(categoryId: string): Promise<string> {
  const category = await db.categories.get(categoryId)
  const tomorrow = getNextReviewDate(1, new Date(), category?.stageIntervals)

  const existing = await db.stacks
    .where('categoryId').equals(categoryId)
    .filter(s => s.stage === 1 && !s.isCompleted && s.nextReviewDate === tomorrow)
    .first()
  if (existing) return existing.id

  const now = Date.now()
  const stackId = generateId()
  await db.stacks.add({
    id: stackId,
    categoryId,
    stage: 1,
    nextReviewDate: tomorrow,
    scheduledReviewDate: tomorrow,
    isCompleted: false,
    createdAt: now,
    updatedAt: now,
  })
  await mergeEligibleStacks(categoryId)
  return stackId
}

/**
 * Get or create the single "waiting" stack for a category (stage 0).
 * Cards here are excluded from review/streak/stage stats until promoted to stage 1.
 */
export async function getOrCreateWaitingStack(categoryId: string): Promise<string> {
  const existing = await db.stacks
    .where('categoryId').equals(categoryId)
    .filter(s => s.stage === WAITING_STAGE && !s.isCompleted)
    .first()
  if (existing) return existing.id

  const now = Date.now()
  const stackId = generateId()
  const t = today()
  await db.stacks.add({
    id: stackId,
    categoryId,
    stage: WAITING_STAGE,
    nextReviewDate: t,
    scheduledReviewDate: t,
    isCompleted: false,
    createdAt: now,
    updatedAt: now,
  })
  return stackId
}

/** Get interval days for a stage, respecting per-category overrides. */
export function getIntervalDays(stage: number, categoryIntervals?: Record<number, number>): number {
  return categoryIntervals?.[stage] ?? STAGE_INTERVALS[stage] ?? 1
}

export function getNextReviewDate(
  stage: number,
  fromDate: Date = new Date(),
  categoryIntervals?: Record<number, number>
): string {
  const interval = getIntervalDays(stage, categoryIntervals)
  const next = new Date(fromDate)
  next.setDate(next.getDate() + interval)
  return toDateString(next)
}

export function addDays(dateStr: string, days: number): string {
  // Parse as LOCAL midnight (not UTC) to stay consistent with toDateString/today().
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + days)
  return toDateString(d)
}

export function diffDays(a: string, b: string): number {
  // Parse as LOCAL midnight to avoid off-by-one across timezones.
  const da = new Date(`${a}T00:00:00`).getTime()
  const db2 = new Date(`${b}T00:00:00`).getTime()
  return Math.round((da - db2) / (1000 * 60 * 60 * 24))
}

/**
 * Process review results for a stack.
 * - All pass → promote stack to next stage
 * - Any fail → failed cards move to a new Stage 1 stack; passed cards stay and stack gets promoted
 */
export async function processReviewResult(
  stackId: string,
  results: Map<string, 'pass' | 'fail'>
): Promise<{ promoted: boolean; demotedCount: number; completedStack: boolean; stackEmpty?: boolean; autoDeleted?: boolean }> {
  const now = Date.now()
  const stack = await db.stacks.get(stackId)
  if (!stack) throw new Error(`Stack ${stackId} not found`)

  // Determine maxStages and custom intervals from the category
  const category = await db.categories.get(stack.categoryId)
  const maxStages = category?.maxStages ?? MAX_STAGE
  const categoryIntervals = category?.stageIntervals

  const failedIds = [...results.entries()].filter(([, r]) => r === 'fail').map(([id]) => id)
  const passedIds = [...results.entries()].filter(([, r]) => r === 'pass').map(([id]) => id)

  const allPassed = failedIds.length === 0

  await db.transaction('rw', [db.stacks, db.cards], async () => {
    // Update lastReviewed for all reviewed cards
    for (const [cardId] of results) {
      await db.cards.update(cardId, { lastReviewed: now, updatedAt: now })
    }

    if (allPassed) {
      const newStage = stack.stage < maxStages ? stack.stage + 1 : maxStages
      const isCompleted = stack.stage >= maxStages
      const promotedDate = getNextReviewDate(newStage, new Date(), categoryIntervals)
      await db.stacks.update(stackId, {
        stage: newStage,
        nextReviewDate: promotedDate,
        scheduledReviewDate: promotedDate,
        isCompleted,
        updatedAt: now,
      })
    } else {
      // Move failed cards to tomorrow's Stage 1 stack (reuse existing or create)
      const tomorrow = getNextReviewDate(1, new Date(), categoryIntervals)
      let targetStackId: string
      const existing = await db.stacks
        .where('categoryId')
        .equals(stack.categoryId)
        .filter(s => s.stage === 1 && !s.isCompleted && s.nextReviewDate === tomorrow)
        .first()
      if (existing) {
        targetStackId = existing.id
      } else {
        targetStackId = generateId()
        await db.stacks.add({
          id: targetStackId,
          categoryId: stack.categoryId,
          stage: 1,
          nextReviewDate: tomorrow,
          scheduledReviewDate: tomorrow,
          isCompleted: false,
          createdAt: now,
          updatedAt: now,
        })
      }
      for (const cardId of failedIds) {
        await db.cards.update(cardId, {
          stackId: targetStackId,
          updatedAt: now,
        })
      }

      // If there are still passed cards in the original stack, promote it
      if (passedIds.length > 0) {
        const newStage = stack.stage < maxStages ? stack.stage + 1 : maxStages
        const isCompleted = stack.stage >= maxStages
        const promotedDate2 = getNextReviewDate(newStage, new Date(), categoryIntervals)
        await db.stacks.update(stackId, {
          stage: newStage,
          nextReviewDate: promotedDate2,
          scheduledReviewDate: promotedDate2,
          isCompleted,
          updatedAt: now,
        })
      }
      // When all failed: do NOT delete the stack; UI will ask user whether to remove or keep empty
    }
  })

  // After updating, try to merge eligible stacks in this category
  await mergeEligibleStacks(stack.categoryId)

  const stackEmpty = !allPassed && passedIds.length === 0
  const isLastStage = stack.stage >= maxStages
  if (stackEmpty && isLastStage) {
    await db.stacks.delete(stackId)
    scheduleDriveSync()
    return {
      promoted: allPassed,
      demotedCount: failedIds.length,
      completedStack: false,
      stackEmpty: true,
      autoDeleted: true,
    }
  }

  scheduleDriveSync()
  return {
    promoted: allPassed,
    demotedCount: failedIds.length,
    completedStack: allPassed && stack.stage >= maxStages,
    stackEmpty,
  }
}

/**
 * Merge stacks in the same category and stage whose nextReviewDate is within tolerance.
 * Uses simple categoryId index (not compound) for maximum reliability.
 */
export async function mergeEligibleStacks(categoryId: string): Promise<boolean> {
  const now = Date.now()
  let didMerge = false

  try {
    // Fetch all non-completed stacks for this category in one query (avoids compound index issues)
    const allStacks = await db.stacks
      .where('categoryId')
      .equals(categoryId)
      .filter(s => !s.isCompleted)
      .toArray()

    // Group by stage
    const byStage = new Map<number, DBStack[]>()
    for (const s of allStacks) {
      if (!byStage.has(s.stage)) byStage.set(s.stage, [])
      byStage.get(s.stage)!.push(s)
    }

    for (const [stage, stacks] of byStage) {
      const tolerance = MERGE_TOLERANCE[stage]
      if (tolerance === null || tolerance === undefined) continue
      if (stacks.length < 2) continue

      // Sort by nextReviewDate ascending
      stacks.sort((a, b) => a.nextReviewDate.localeCompare(b.nextReviewDate))

      // processed tracks ALL group members to avoid double-processing
      const processed = new Set<string>()

      for (let i = 0; i < stacks.length; i++) {
        if (processed.has(stacks[i].id)) continue

        const base = stacks[i]
        const group: DBStack[] = [base]

        for (let j = i + 1; j < stacks.length; j++) {
          if (processed.has(stacks[j].id)) continue
          const diff = Math.abs(diffDays(stacks[j].nextReviewDate, base.nextReviewDate))
          if (diff <= tolerance) {
            group.push(stacks[j])
          }
        }

        // Mark ALL group members as processed immediately
        for (const s of group) processed.add(s.id)

        if (group.length < 2) continue

        didMerge = true

        // Use the oldest (earliest created) stack as target (its name/date is preserved)
        const targetStack = group.reduce((a, b) => a.createdAt <= b.createdAt ? a : b)
        const mergeStacks = group.filter(s => s.id !== targetStack.id)

        await db.transaction('rw', [db.stacks, db.cards], async () => {
          for (const s of mergeStacks) {
            await db.cards
              .where('stackId').equals(s.id)
              .modify({ stackId: targetStack.id, updatedAt: now })
            await db.stacks.delete(s.id)
          }
          await db.stacks.update(targetStack.id, { updatedAt: now })
        })
      }
    }
    if (didMerge) scheduleDriveSync()
  } catch (err) {
    console.error('[ReVibe] mergeEligibleStacks error:', err)
  }
  return didMerge
}

/**
 * Apply partial review results when user exits mid-review and chooses to save.
 * Failed → stage-1 stack with tomorrow; Passed → new stack in next stage with same name; Unanswered stay.
 */
export async function applyPartialReviewResult(
  stackId: string,
  results: Map<string, 'pass' | 'fail'>
): Promise<{ categoryId: string; stage: number }> {
  const now = Date.now()
  const stack = await db.stacks.get(stackId)
  if (!stack) throw new Error(`Stack ${stackId} not found`)
  const category = await db.categories.get(stack.categoryId)
  const maxStages = category?.maxStages ?? MAX_STAGE
  const categoryIntervals = category?.stageIntervals

  const failedIds = [...results.entries()].filter(([, r]) => r === 'fail').map(([id]) => id)
  const passedIds = [...results.entries()].filter(([, r]) => r === 'pass').map(([id]) => id)
  const tomorrow = getNextReviewDate(1, new Date(), categoryIntervals)
  const nextStage = stack.stage < maxStages ? stack.stage + 1 : maxStages
  const nextStageDate = getNextReviewDate(nextStage, new Date(), categoryIntervals)

  await db.transaction('rw', [db.stacks, db.cards], async () => {
    for (const [cardId] of results) {
      await db.cards.update(cardId, { lastReviewed: now, updatedAt: now })
    }

    if (failedIds.length > 0) {
      let targetId: string
      const existing = await db.stacks
        .where('categoryId')
        .equals(stack.categoryId)
        .filter(s => s.stage === 1 && !s.isCompleted && s.nextReviewDate === tomorrow)
        .first()
      if (existing) targetId = existing.id
      else {
        targetId = generateId()
        await db.stacks.add({
          id: targetId,
          categoryId: stack.categoryId,
          stage: 1,
          nextReviewDate: tomorrow,
          scheduledReviewDate: tomorrow,
          isCompleted: false,
          name: stack.name,
          createdAt: now,
          updatedAt: now,
        })
      }
      for (const id of failedIds) {
        await db.cards.update(id, { stackId: targetId, updatedAt: now })
      }
    }

    if (passedIds.length > 0) {
      const newStackId = generateId()
      await db.stacks.add({
        id: newStackId,
        categoryId: stack.categoryId,
        stage: nextStage,
        nextReviewDate: nextStageDate,
        scheduledReviewDate: nextStageDate,
        isCompleted: nextStage >= maxStages,
        name: stack.name,
        createdAt: stack.createdAt,
        updatedAt: now,
      })
      for (const id of passedIds) {
        await db.cards.update(id, { stackId: newStackId, updatedAt: now })
      }
    }
  })

  const remaining = await db.cards.where('stackId').equals(stackId).count()
  // Default: stay on the original stage (stack still has unanswered cards there).
  let navigateStage = stack.stage
  if (remaining === 0) {
    await db.stacks.delete(stackId)
    // Original stack is gone — navigate to where the saved cards actually moved
    // (failed → stage 1, otherwise the promoted next stage) so it isn't empty.
    navigateStage = failedIds.length > 0 ? 1 : nextStage
  }
  await mergeEligibleStacks(stack.categoryId)
  scheduleDriveSync()
  return { categoryId: stack.categoryId, stage: navigateStage }
}

/**
 * Get all stacks due for review today (nextReviewDate <= today).
 */
export async function getTodayReviewStacks(): Promise<DBStack[]> {
  const t = today()
  const all = await db.stacks.filter(s => !s.isCompleted && s.stage >= 1 && s.nextReviewDate <= t).toArray()
  return all
}

/**
 * Detect overdue stacks (nextReviewDate < today), bump their nextReviewDate to today
 * for filtering/merging purposes while preserving scheduledReviewDate for display.
 * Also merges eligible stacks across ALL categories.
 * Returns the number of overdue stacks found.
 */
export async function handleOverdueStacks(): Promise<number> {
  const t = today()
  const overdueStacks = await db.stacks
    .filter(s => !s.isCompleted && s.stage >= 1 && s.nextReviewDate < t)
    .toArray()

  const now = Date.now()
  for (const stack of overdueStacks) {
    await db.stacks.update(stack.id, {
      nextReviewDate: t,
      // scheduledReviewDate intentionally NOT updated — keeps original planned date for display
      updatedAt: now,
    })
  }

  // Always merge all categories on startup (not just ones with overdue stacks)
  const allCategories = await db.categories.toArray()
  let dirty = overdueStacks.length > 0
  const mergeResults = await Promise.all(allCategories.map(cat => mergeEligibleStacks(cat.id)))
  if (mergeResults.some(Boolean)) dirty = true

  if (dirty) scheduleDriveSync()

  return overdueStacks.length
}
