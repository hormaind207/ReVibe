'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, GraduationCap, MoreVertical, Pencil, Trash2, Settings2, Check } from 'lucide-react'
import { useNavigation } from '@/lib/store'
import { useCategory, updateCategory, deleteCategory } from '@/lib/hooks/use-categories'
import { useStackCountByStage, useGraduatedStacks } from '@/lib/hooks/use-stacks'
import { STAGES } from '@/lib/types'
import { DEFAULT_MAX_STAGES, STAGE_INTERVALS, mergeEligibleStacks } from '@/lib/leitner'
import { db, today, toDateString } from '@/lib/db'
import { uploadToGDrive } from '@/lib/sync'
import { ScreenHeader } from '@/components/screen-header'
import { ICON_MAP } from './dashboard'

const stageColorClasses = [
  'bg-stage-1', 'bg-stage-2', 'bg-stage-3', 'bg-stage-4',
  'bg-stage-5', 'bg-stage-6', 'bg-stage-7',
]

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
}

const itemVariants = {
  hidden: { opacity: 0, x: -20 },
  show: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
}

function StageRow({
  categoryId, stage, index, customInterval, customLabel, onIntervalChange, onLabelChange,
}: {
  categoryId: string
  stage: typeof STAGES[0]
  index: number
  customInterval?: number
  customLabel?: string
  onIntervalChange: (stageNum: number, days: number) => void
  onLabelChange: (stageNum: number, label: string) => void
}) {
  const { navigate } = useNavigation()
  const stackCount = useStackCountByStage(categoryId, stage.stage) ?? 0
  const [showIntervalEdit, setShowIntervalEdit] = useState(false)
  const [editingLabel, setEditingLabel] = useState(false)
  const [labelInput, setLabelInput] = useState('')
  const currentDays = customInterval ?? STAGE_INTERVALS[stage.stage] ?? 1
  const currentLabel = customLabel ?? stage.label
  const isCustomInterval = customInterval !== undefined && customInterval !== STAGE_INTERVALS[stage.stage]
  const isCustomLabel = !!customLabel && customLabel !== stage.label

  function daysToLabel(days: number) {
    if (days === 1) return '매일'
    if (days < 7) return `${days}일`
    if (days === 7) return '1주'
    if (days < 30) return `${Math.round(days / 7)}주`
    if (days < 60) return '1달'
    return `${Math.round(days / 30)}달`
  }

  const handleStartLabelEdit = () => {
    setLabelInput(currentLabel)
    setEditingLabel(true)
  }

  const handleSaveLabel = () => {
    const trimmed = labelInput.trim()
    if (trimmed) onLabelChange(stage.stage, trimmed)
    setEditingLabel(false)
  }

  return (
    <motion.div variants={itemVariants} className="flex flex-col">
      <div className={`flex items-center justify-between rounded-2xl ${stageColorClasses[index % stageColorClasses.length]} px-5 py-4 shadow-sm`}>
        <button
          className="flex flex-1 flex-col items-start"
          onClick={() => navigate({ type: 'stage', categoryId, stage: stage.stage })}
        >
          <span className="text-sm font-bold text-foreground">
            단계 {stage.stage}: {currentLabel}
            {(isCustomInterval || isCustomLabel) && (
              <span className="ml-1.5 text-[10px] font-bold text-primary">(커스텀)</span>
            )}
          </span>
          <span className="text-xs text-muted-foreground">({stackCount}개 스택)</span>
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowIntervalEdit(v => !v)}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-card/60 text-muted-foreground"
            aria-label="단계 편집"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => navigate({ type: 'stage', categoryId, stage: stage.stage })}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-card/60"
          >
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showIntervalEdit && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mx-2 rounded-b-2xl bg-card/80 px-4 pb-4 pt-3 shadow-inner">
              <p className="mb-3 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200">
                기본 값으로 설정된 과정이 가장 효과적이며, 커스터마이징 시 오류가 발생할 수 있으므로 안 하는 것을 추천합니다.
              </p>

              {/* Stage name */}
              <div className="mb-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">단계 이름</span>
                  {!editingLabel ? (
                    <button
                      onClick={handleStartLabelEdit}
                      className="flex items-center gap-1 rounded-lg bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground hover:bg-primary/20 hover:text-primary"
                    >
                      <Pencil className="h-2.5 w-2.5" />수정
                    </button>
                  ) : (
                    <button
                      onClick={handleSaveLabel}
                      className="flex items-center gap-1 rounded-lg bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground"
                    >
                      <Check className="h-2.5 w-2.5" />저장
                    </button>
                  )}
                </div>
                {editingLabel ? (
                  <input
                    value={labelInput}
                    onChange={e => setLabelInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSaveLabel()}
                    autoFocus
                    className="w-full rounded-xl border border-primary/40 bg-background px-3 py-1.5 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder={stage.label}
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">{currentLabel}</span>
                    {isCustomLabel && (
                      <button
                        onClick={() => onLabelChange(stage.stage, stage.label)}
                        className="text-[10px] text-muted-foreground underline"
                      >
                        기본값 복원
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="mb-1 h-px bg-border" />

              {/* Interval */}
              <div className="mt-2 mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">복습 간격</span>
                <span className="text-sm font-bold text-primary">{currentDays}일 후 ({daysToLabel(currentDays)})</span>
              </div>
              <input
                type="range"
                min={1}
                max={365}
                value={currentDays}
                onChange={e => onIntervalChange(stage.stage, parseInt(e.target.value, 10))}
                className="w-full accent-primary"
              />
              <div className="mt-2 flex gap-1.5 flex-wrap">
                {[1, 2, 7, 14, 30, 60, 90, 180, 365].map(d => (
                  <button
                    key={d}
                    onClick={() => onIntervalChange(stage.stage, d)}
                    className={`rounded-lg px-2.5 py-1 text-[10px] font-bold transition-colors ${
                      currentDays === d ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {daysToLabel(d)}
                  </button>
                ))}
              </div>
              {isCustomInterval && (
                <button
                  onClick={() => onIntervalChange(stage.stage, STAGE_INTERVALS[stage.stage] ?? 1)}
                  className="mt-2 w-full rounded-lg bg-muted py-1.5 text-xs font-medium text-muted-foreground"
                >
                  간격 기본값으로 초기화 ({STAGE_INTERVALS[stage.stage]}일)
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

interface CategoryViewProps {
  categoryId: string
}

export function CategoryView({ categoryId }: CategoryViewProps) {
  const { navigate, goBack } = useNavigation()
  const category = useCategory(categoryId)
  const graduatedStacks = useGraduatedStacks(categoryId) ?? []
  const [showMenu, setShowMenu] = useState(false)

  // Merge eligible stacks whenever this screen is opened
  useEffect(() => {
    mergeEligibleStacks(categoryId).catch(() => {})
  }, [categoryId])
  const [editMode, setEditMode] = useState(false)
  const [editName, setEditName] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [editStagesMode, setEditStagesMode] = useState(false)
  const [editMaxStages, setEditMaxStages] = useState(DEFAULT_MAX_STAGES)

  if (!category) return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">로딩 중...</p>
    </div>
  )

  const Icon = ICON_MAP[category.icon] || ICON_MAP.book
  const maxStages = category.maxStages ?? DEFAULT_MAX_STAGES
  const visibleStages = STAGES.slice(0, maxStages)

  const handleEdit = () => {
    setEditName(category.name)
    setEditMode(true)
    setShowMenu(false)
  }

  const handleSaveName = async () => {
    if (!editName.trim()) return
    await updateCategory(categoryId, { name: editName.trim() })
    setEditMode(false)
  }

  const handleDelete = async () => {
    await deleteCategory(categoryId)
    goBack()
  }

  const handleEditStages = () => {
    setEditMaxStages(maxStages)
    setEditStagesMode(true)
    setShowMenu(false)
  }

  const handleSaveMaxStages = async () => {
    await updateCategory(categoryId, { maxStages: editMaxStages })
    setEditStagesMode(false)
  }

  const handleLabelChange = async (stageNum: number, label: string) => {
    const current = category.stageLabels ?? {}
    await updateCategory(categoryId, { stageLabels: { ...current, [stageNum]: label } })
  }

  const handleIntervalChange = async (stageNum: number, days: number) => {
    const current = category.stageIntervals ?? {}
    const oldDays = current[stageNum] ?? STAGE_INTERVALS[stageNum] ?? 1

    // Save new interval to category
    await updateCategory(categoryId, { stageIntervals: { ...current, [stageNum]: days } })

    // Recalculate nextReviewDate for all stacks in this stage
    const stacks = await db.stacks
      .where('[categoryId+stage]')
      .equals([categoryId, stageNum])
      .filter(s => !s.isCompleted)
      .toArray()

    const t = today()
    const now = Date.now()
    for (const stack of stacks) {
      // Estimate last review date = nextReviewDate - oldDays
      const oldNext = new Date(stack.nextReviewDate + 'T00:00:00')
      const lastReview = new Date(oldNext)
      lastReview.setDate(lastReview.getDate() - oldDays)
      // New review date = lastReview + newDays
      const newNext = new Date(lastReview)
      newNext.setDate(newNext.getDate() + days)
      const newDateStr = toDateString(newNext)
      // Never go before today
      const finalDate = newDateStr < t ? t : newDateStr
      await db.stacks.update(stack.id, {
        nextReviewDate: finalDate,
        scheduledReviewDate: finalDate,
        updatedAt: now,
      })
    }

    await mergeEligibleStacks(categoryId)
    await uploadToGDrive().catch(() => {})
  }

  return (
    <div className="flex flex-col pb-20">
      <ScreenHeader
        title={editMode ? '' : category.name}
        showBack
        rightElement={
          <div className="relative">
            <button
              onClick={() => setShowMenu(v => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-card text-muted-foreground shadow-sm"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-10 z-50 min-w-[160px] rounded-2xl bg-card p-1 shadow-xl">
                  <button
                    onClick={handleEdit}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
                  >
                    <Pencil className="h-4 w-4" />이름 수정
                  </button>
                  <button
                    onClick={handleEditStages}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
                  >
                    <Settings2 className="h-4 w-4" />단계 수 변경
                  </button>
                  <button
                    onClick={() => { setDeleteConfirm(true); setShowMenu(false) }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />삭제
                  </button>
                </div>
              </>
            )}
          </div>
        }
      />

      {/* Edit Name inline */}
      {editMode && (
        <div className="mx-4 mb-2 flex gap-2">
          <input
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSaveName()}
            className="flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            autoFocus
          />
          <button onClick={handleSaveName} className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">저장</button>
          <button onClick={() => setEditMode(false)} className="rounded-xl bg-muted px-3 py-2 text-xs font-medium">취소</button>
        </div>
      )}

      {/* Edit max stages */}
      {editStagesMode && (
        <div className="mx-4 mb-2 rounded-2xl bg-card p-4 shadow-sm">
          <p className="mb-2 text-sm font-bold text-foreground">단계 수 변경</p>
          <div className="flex items-center gap-3 mb-2">
            <input
              type="range" min={3} max={10} value={editMaxStages}
              onChange={e => setEditMaxStages(parseInt(e.target.value, 10))}
              className="flex-1 accent-primary"
            />
            <span className="w-14 text-center text-base font-bold text-primary">{editMaxStages}단계</span>
          </div>
          <div className="mb-3 flex gap-1 flex-wrap">
            {[3, 4, 5, 6, 7, 8, 10].map(n => (
              <button
                key={n}
                onClick={() => setEditMaxStages(n)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                  editMaxStages === n ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}
              >
                {n}단계
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={handleSaveMaxStages} className="flex-1 rounded-xl bg-primary py-2 text-xs font-bold text-primary-foreground">저장</button>
            <button onClick={() => setEditStagesMode(false)} className="flex-1 rounded-xl bg-muted py-2 text-xs font-medium">취소</button>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="mx-4 mb-4 rounded-2xl bg-destructive/10 p-4">
          <p className="mb-3 text-sm font-semibold text-destructive">
            '{category.name}' 카테고리와 모든 카드를 삭제할까요?
          </p>
          <div className="flex gap-2">
            <button onClick={handleDelete} className="flex-1 rounded-xl bg-destructive py-2 text-sm font-bold text-white">삭제</button>
            <button onClick={() => setDeleteConfirm(false)} className="flex-1 rounded-xl bg-muted py-2 text-sm font-medium">취소</button>
          </div>
        </div>
      )}

      <motion.div
        className="flex flex-col gap-3 px-4"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {visibleStages.map((stage, i) => (
          <StageRow
            key={stage.stage}
            categoryId={categoryId}
            stage={stage}
            index={i}
            customInterval={category.stageIntervals?.[stage.stage]}
            customLabel={category.stageLabels?.[stage.stage]}
            onIntervalChange={handleIntervalChange}
            onLabelChange={handleLabelChange}
          />
        ))}

        {/* Graduated */}
        <motion.button
          variants={itemVariants}
          whileTap={{ scale: 0.97 }}
          onClick={() => navigate({ type: 'stage', categoryId, stage: 99 })}
          className="flex items-center justify-between rounded-2xl bg-stage-graduated px-5 py-4 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <GraduationCap className="h-6 w-6 text-foreground" />
            <div className="flex flex-col items-start">
              <span className="text-sm font-bold text-foreground">졸업</span>
              <span className="text-xs text-muted-foreground">완료된 카드</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-muted-foreground">{graduatedStacks.length}개</span>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>
        </motion.button>
      </motion.div>
    </div>
  )
}
