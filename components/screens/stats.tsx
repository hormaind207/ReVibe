'use client'

import { motion } from 'framer-motion'
import { ScreenHeader } from '@/components/screen-header'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, today } from '@/lib/db'
import { STAGES } from '@/lib/types'

export function StatsScreen() {
  const totalCards = useLiveQuery(() => db.cards.count(), [], 0) ?? 0
  const totalCategories = useLiveQuery(() => db.categories.count(), [], 0) ?? 0
  const totalStacks = useLiveQuery(() => db.stacks.count(), [], 0) ?? 0
  const graduatedCount = useLiveQuery(
    () => db.stacks.filter(s => s.isCompleted).count(),
    [],
    0
  ) ?? 0

  const t = today()
  const todayCount = useLiveQuery(
    async () => {
      const stacks = await db.stacks.filter(s => !s.isCompleted && s.nextReviewDate <= t).toArray()
      let count = 0
      for (const s of stacks) {
        count += await db.cards.where('stackId').equals(s.id).count()
      }
      return count
    },
    [],
    0
  ) ?? 0

  const stageDistribution = useLiveQuery(
    async () => {
      const results = await Promise.all(
        STAGES.map(async ({ stage }) => {
          const stacks = await db.stacks.where('stage').equals(stage).filter(s => !s.isCompleted).toArray()
          let count = 0
          for (const s of stacks) {
            count += await db.cards.where('stackId').equals(s.id).count()
          }
          return { stage, count }
        })
      )
      return results
    },
    [],
    STAGES.map(s => ({ stage: s.stage, count: 0 }))
  )

  const stageIntervalLabels: Record<number, string> = {
    1: '매일', 2: '2일', 3: '1주', 4: '2주', 5: '1달', 6: '1달', 7: '1달',
  }

  const maxCount = Math.max(...(stageDistribution?.map(s => s.count) ?? [0]), 1)

  const stageBgColors = [
    'bg-stage-1', 'bg-stage-2', 'bg-stage-3', 'bg-stage-4',
    'bg-stage-5', 'bg-stage-6', 'bg-stage-7',
  ]

  return (
    <div className="flex flex-col pb-20">
      <ScreenHeader title="통계" />

      <motion.div
        className="flex flex-col gap-5 px-4"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Overview cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col items-center rounded-2xl bg-card p-5 shadow-sm">
            <span className="text-3xl font-extrabold text-primary">{totalCards}</span>
            <span className="text-xs text-muted-foreground mt-1">전체 카드</span>
          </div>
          <div className="flex flex-col items-center rounded-2xl bg-card p-5 shadow-sm">
            <span className="text-3xl font-extrabold text-primary">{totalCategories}</span>
            <span className="text-xs text-muted-foreground mt-1">카테고리</span>
          </div>
          <div className="flex flex-col items-center rounded-2xl bg-card p-5 shadow-sm">
            <span className="text-3xl font-extrabold text-[#e89b73]">{todayCount}</span>
            <span className="text-xs text-muted-foreground mt-1">오늘 복습</span>
          </div>
          <div className="flex flex-col items-center rounded-2xl bg-card p-5 shadow-sm">
            <span className="text-3xl font-extrabold text-amber-600">{graduatedCount}</span>
            <span className="text-xs text-muted-foreground mt-1">졸업 스택</span>
          </div>
        </div>

        {/* Stage distribution */}
        <div className="rounded-2xl bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-foreground">단계별 카드 수</h2>
          <div className="flex flex-col gap-3">
            {(stageDistribution ?? []).map(({ stage, count }, i) => (
              <div key={stage} className="flex items-center gap-3">
                <div className="flex w-16 flex-col">
                  <span className="text-xs font-semibold text-muted-foreground">단계 {stage}</span>
                  <span className="text-[10px] text-muted-foreground/70">{stageIntervalLabels[stage]}</span>
                </div>
                <div className="relative flex-1 h-6 rounded-lg bg-muted overflow-hidden">
                  <motion.div
                    className={`h-6 rounded-lg ${stageBgColors[i]}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${(count / maxCount) * 100}%` }}
                    transition={{ delay: stage * 0.05, duration: 0.5, ease: 'easeOut' }}
                  />
                </div>
                <span className="w-8 text-right text-xs font-bold text-foreground">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Total stacks */}
        <div className="flex items-center justify-between rounded-2xl bg-card px-5 py-4 shadow-sm">
          <span className="text-sm font-semibold text-foreground">전체 스택</span>
          <span className="text-2xl font-extrabold text-primary">{totalStacks}</span>
        </div>
      </motion.div>
    </div>
  )
}
