'use client'

import { createElement, useCallback, useEffect, useRef, useState } from 'react'
import { DuplicateCardDialog, type DuplicateDialogRequest } from '@/components/modals/duplicate-card-dialog'
import { bulkImportCards, createCard } from '@/lib/hooks/use-cards'
import {
  findCardsWithSameFront,
  normalizeFront,
  type DuplicateMatch,
} from '@/lib/card-lookup'
import type { CardImportEntry } from '@/lib/import-cards'
import type { DBCard } from '@/lib/db'

type DuplicateDecision = 'add' | 'skip'

function pendingBatchMatch(front: string, back: string, index: number): DuplicateMatch {
  const pseudoCard = {
    id: `pending-${index}`,
    stackId: '',
    categoryId: '',
    front,
    back,
    lastReviewed: null,
    createdAt: 0,
    updatedAt: 0,
  } satisfies DBCard

  const pseudoStack = {
    id: '',
    categoryId: '',
    stage: 0,
    nextReviewDate: '',
    isCompleted: false,
    createdAt: 0,
    updatedAt: 0,
  }

  return {
    card: pseudoCard,
    stack: pseudoStack,
    stageLabel: '이번 추가',
    stackDisplayName: '',
    locationLabel: '이번에 추가 예정',
    isPendingBatch: true,
  }
}

function getBatchMatches(
  front: string,
  pendingInBatch: Array<{ front: string; back: string }>
): DuplicateMatch[] {
  return pendingInBatch
    .map((p, idx) => ({ p, idx }))
    .filter(({ p }) => normalizeFront(p.front) === front)
    .map(({ p, idx }) => pendingBatchMatch(p.front, p.back, idx))
}

async function countBulkConflicts(
  categoryId: string,
  entries: CardImportEntry[]
): Promise<number> {
  const seenFronts = new Set<string>()
  let count = 0

  for (const entry of entries) {
    const front = normalizeFront(entry.front)
    const back = entry.back.trim()
    if (!front || !back) continue

    const dbMatches = await findCardsWithSameFront(categoryId, front)
    const fileDuplicate = seenFronts.has(front)
    if (dbMatches.length > 0 || fileDuplicate) count++
    seenFronts.add(front)
  }

  return count
}

export function useCardAddFlow() {
  const [warnOnDuplicateFront, setWarnOnDuplicateFront] = useState(true)
  const [dialogRequest, setDialogRequest] = useState<DuplicateDialogRequest | null>(null)
  const resolverRef = useRef<((decision: DuplicateDecision) => void) | null>(null)

  const requestDuplicateDecision = useCallback((request: DuplicateDialogRequest): Promise<DuplicateDecision> => {
    return new Promise(resolve => {
      // Resolve any still-pending decision so its awaiter can't hang forever.
      resolverRef.current?.('skip')
      resolverRef.current = resolve
      setDialogRequest(request)
    })
  }, [])

  // On unmount, unblock any awaiter waiting on a decision (treat as skip).
  useEffect(() => () => {
    resolverRef.current?.('skip')
    resolverRef.current = null
  }, [])

  const handleDialogDecision = useCallback((decision: DuplicateDecision) => {
    resolverRef.current?.(decision)
    resolverRef.current = null
    setDialogRequest(null)
  }, [])

  const duplicateDialog = createElement(DuplicateCardDialog, {
    request: dialogRequest,
    onDecision: handleDialogDecision,
  })

  const addSingleCard = useCallback(
    async (data: { stackId: string; categoryId: string; front: string; back: string }) => {
      const front = normalizeFront(data.front)
      const back = data.back.trim()
      if (!front || !back) return false

      if (warnOnDuplicateFront) {
        const matches = await findCardsWithSameFront(data.categoryId, front)
        if (matches.length > 0) {
          const decision = await requestDuplicateDecision({
            front,
            back,
            matches,
            isBulk: false,
          })
          if (decision === 'skip') return false
        }
      }

      await createCard({ stackId: data.stackId, categoryId: data.categoryId, front, back })
      return true
    },
    [warnOnDuplicateFront, requestDuplicateDecision]
  )

  const addBulkCards = useCallback(
    async (data: { stackId: string; categoryId: string; entries: CardImportEntry[] }) => {
      const approved: CardImportEntry[] = []
      const pendingInBatch: Array<{ front: string; back: string }> = []

      const totalConflicts = warnOnDuplicateFront
        ? await countBulkConflicts(data.categoryId, data.entries)
        : 0
      let conflictProgress = 0

      for (const entry of data.entries) {
        const front = normalizeFront(entry.front)
        const back = entry.back.trim()
        if (!front || !back) continue

        if (!warnOnDuplicateFront) {
          approved.push({ front, back })
          pendingInBatch.push({ front, back })
          continue
        }

        const dbMatches = await findCardsWithSameFront(data.categoryId, front)
        const batchMatches = getBatchMatches(front, pendingInBatch)
        const allMatches = [...dbMatches, ...batchMatches]

        if (allMatches.length === 0) {
          approved.push({ front, back })
          pendingInBatch.push({ front, back })
          continue
        }

        conflictProgress++
        const decision = await requestDuplicateDecision({
          front,
          back,
          matches: allMatches,
          isBulk: true,
          progress: totalConflicts > 1 ? { current: conflictProgress, total: totalConflicts } : undefined,
        })

        if (decision === 'add') {
          approved.push({ front, back })
          pendingInBatch.push({ front, back })
        }
      }

      if (approved.length === 0) return 0
      await bulkImportCards(data.stackId, data.categoryId, approved)
      return approved.length
    },
    [warnOnDuplicateFront, requestDuplicateDecision]
  )

  return {
    warnOnDuplicateFront,
    setWarnOnDuplicateFront,
    addSingleCard,
    addBulkCards,
    duplicateDialog,
  }
}
