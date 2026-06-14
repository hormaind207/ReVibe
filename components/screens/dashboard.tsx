'use client'

import { useState, useMemo, memo } from 'react'
import { useDragScroll } from '@/hooks/use-drag-scroll'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, Plus, BookOpen, Languages, Calculator, FlaskConical, Music, Globe, Flame, MoreVertical, Trash2 } from 'lucide-react'
import { useNavigation } from '@/lib/store'
import { useCategories, deleteCategory } from '@/lib/hooks/use-categories'
import { useTodayReviewStacks } from '@/lib/hooks/use-stacks'
import { ScreenHeader } from '@/components/screen-header'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import type { DBCategory, DBStack } from '@/lib/db'
import { getStreakTierConfig } from '@/lib/streak'
import { AddCategoryModal } from '@/components/modals/add-category-modal'
import { QuickAddCardModal } from '@/components/modals/quick-add-card-modal'
import { useUserProfile } from '@/lib/hooks/use-user-profile'
import { useMarketplaceUser } from '@/lib/marketplace/auth'
import { resolveProfileAvatarUrl } from '@/lib/google-auth'

export const ICON_MAP: Record<string, typeof BookOpen> = {
  book: BookOpen,
  languages: Languages,
  calculator: Calculator,
  flask: FlaskConical,
  music: Music,
  globe: Globe,
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
}

// Skeleton placeholder
function CategorySkeleton() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-muted/60 p-5 animate-pulse">
      <div className="h-12 w-12 rounded-xl bg-muted" />
      <div className="h-3 w-16 rounded bg-muted" />
      <div className="h-2 w-10 rounded bg-muted/60" />
    </div>
  )
}

function CategoryCardInner({ category, cardCount }: { category: DBCategory; cardCount?: number }) {
  const { navigate } = useNavigation()
  const Icon = ICON_MAP[category.icon] || BookOpen
  const [showMenu, setShowMenu] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleDelete = async () => {
    await deleteCategory(category.id)
    setConfirmDelete(false)
    setShowMenu(false)
  }

  return (
    <motion.div variants={itemVariants} className="relative">
      <motion.button
        whileTap={{ scale: 0.96 }}
        onClick={() => navigate({ type: 'category', categoryId: category.id })}
        className={`relative flex w-full flex-col items-center gap-2 overflow-hidden rounded-2xl ${category.backgroundImage ? 'bg-card' : category.color} p-5 shadow-sm`}
        style={category.backgroundImage ? { backgroundImage: `url(${category.backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      >
        {category.backgroundImage && <span className="absolute inset-0 bg-black/35" aria-hidden />}
        <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-card/80 shadow-sm">
          <Icon className="h-6 w-6 text-foreground" />
        </div>
        <span className={`relative text-sm font-bold ${category.backgroundImage ? 'text-white' : 'text-foreground'}`}>{category.name}</span>
        <span className={`relative text-xs ${category.backgroundImage ? 'text-white/80' : 'text-muted-foreground'}`}>
          {cardCount === undefined ? '...' : `(${cardCount}장)`}
        </span>
      </motion.button>

      {/* Three-dot menu button */}
      <button
        onClick={(e) => { e.stopPropagation(); setShowMenu(v => !v) }}
        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-lg bg-card/60 text-muted-foreground"
        aria-label="카테고리 옵션"
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>

      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div className="absolute right-0 top-8 z-50 min-w-[140px] rounded-2xl bg-card p-1 shadow-xl">
            <button
              onClick={() => { navigate({ type: 'category', categoryId: category.id }); setShowMenu(false) }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
            >
              <ChevronRight className="h-4 w-4" />열기
            </button>
            <button
              onClick={() => { setConfirmDelete(true); setShowMenu(false) }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />삭제
            </button>
          </div>
        </>
      )}

      {/* Delete confirmation overlay */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-2 rounded-2xl bg-card/95 p-3 shadow-xl"
          >
            <p className="text-center text-xs font-semibold text-foreground">'{category.name}' 삭제할까요?</p>
            <div className="flex gap-1.5 w-full">
              <button
                onClick={handleDelete}
                className="flex-1 rounded-xl bg-destructive py-2 text-xs font-bold text-white"
              >
                삭제
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 rounded-xl bg-muted py-2 text-xs font-medium"
              >
                취소
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

const CategoryCard = memo(CategoryCardInner)

function TodayStackCardInner({ stack, categoryName, cardCount }: { stack: DBStack; categoryName: string; cardCount?: number }) {
  const { navigate } = useNavigation()

  return (
    <button
      onClick={() => navigate({ type: 'stack', categoryId: stack.categoryId, stackId: stack.id })}
      className="flex min-w-[140px] flex-shrink-0 flex-col rounded-2xl bg-card p-4 shadow-sm transition-transform active:scale-95"
    >
      <p className="text-sm font-bold text-foreground text-balance">{categoryName}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">단계 {stack.stage}</p>
      <div className="mt-auto flex items-center gap-1 pt-3">
        <span className="text-xs text-muted-foreground">
          {cardCount === undefined ? '...' : `${cardCount}장`}
        </span>
        <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
      </div>
    </button>
  )
}

const TodayStackCard = memo(TodayStackCardInner)


export function DashboardScreen() {
  const { navigate } = useNavigation()
  const userProfile = useUserProfile()
  const { user: marketplaceUser } = useMarketplaceUser()
  const profileAvatarUrl = resolveProfileAvatarUrl(userProfile.avatarImage, marketplaceUser)
  // undefined = loading, [] = empty, Category[] = has data
  const categories = useCategories()
  const todayStacks = useTodayReviewStacks()
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const dragScroll = useDragScroll()

  const isLoading = categories === undefined || todayStacks === undefined

  // Batch card count queries — one live query for categories + today stacks
  const categoryIds = useMemo(() => (categories ?? []).map(c => c.id), [categories])
  const todayStackIds = useMemo(() => (todayStacks ?? []).map(s => s.id), [todayStacks])

  const homeCounts = useLiveQuery(
    async () => {
      const [catPairs, stackPairs] = await Promise.all([
        categoryIds.length
          ? Promise.all(
              categoryIds.map((id) =>
                db.cards.where('categoryId').equals(id).count().then((n) => [id, n] as const)
              )
            )
          : Promise.resolve([] as readonly (readonly [string, number])[]),
        todayStackIds.length
          ? Promise.all(
              todayStackIds.map((id) =>
                db.cards.where('stackId').equals(id).count().then((n) => [id, n] as const)
              )
            )
          : Promise.resolve([] as readonly (readonly [string, number])[]),
      ])
      const categoryCounts = Object.fromEntries(catPairs) as Record<string, number>
      const stackCounts = Object.fromEntries(stackPairs) as Record<string, number>
      const totalTodayCards = stackPairs.reduce((sum, [, n]) => sum + n, 0)
      return { categoryCounts, stackCounts, totalTodayCards }
    },
    [categoryIds.join(','), todayStackIds.join(',')]
  )

  const categoryCounts = homeCounts?.categoryCounts
  const stackCounts = homeCounts?.stackCounts
  const totalTodayCards = homeCounts?.totalTodayCards

  const streakRow = useLiveQuery(() => db.streakMeta.get('meta'), [])
  const hasNonGraduated = useLiveQuery(
    () => db.stacks.filter(s => !s.isCompleted).count().then(n => n > 0)
  )

  const categoryMap = useMemo(() => new Map((categories ?? []).map(c => [c.id, c])), [categories])
  const streak = streakRow?.currentStreak ?? 0
  const streakTier = getStreakTierConfig(streak)
  const showStreak = hasNonGraduated === true

  return (
    <div className="flex flex-col pb-20">
      <ScreenHeader
        title="ReVibe"
        rightElement={
          <button
            onClick={() => navigate({ type: 'profile' })}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 overflow-hidden transition-transform active:scale-95"
            aria-label="프로필 및 설정"
          >
            {profileAvatarUrl ? (
              <img
                src={profileAvatarUrl}
                alt="프로필"
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="text-lg">{userProfile.avatarEmoji}</span>
            )}
          </button>
        }
      />

      <motion.div
        className="flex flex-col gap-6 px-4"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {/* Review streak — only when at least one non-graduated card exists */}
        {showStreak && (
          <motion.div
            variants={itemVariants}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 ${streakTier.className}`}
          >
            {streakTier.flameCount > 0 && (
              <span className="flex items-center gap-0.5">
                {Array.from({ length: streakTier.flameCount }).map((_, i) => (
                  <Flame key={i} className="h-5 w-5 shrink-0" />
                ))}
              </span>
            )}
            <span className="text-sm font-bold tabular-nums">{streak}</span>
            <span className="text-xs opacity-90">{streakTier.label}</span>
          </motion.div>
        )}

        {/* Today's Study Banner */}
        <motion.div variants={itemVariants} className="flex gap-3">
          <button
            onClick={() => {
              if (todayStacks && todayStacks.length > 0) {
                navigate({ type: 'review', categoryId: todayStacks[0].categoryId, stackId: todayStacks[0].id })
              }
            }}
            disabled={isLoading || !todayStacks?.length}
            className="flex-1 rounded-2xl bg-[#fdb99b]/30 p-5 text-left shadow-sm transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#fdb99b]/60">
                <Flame className="h-5 w-5 text-[#d97706]" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">오늘의 복습</p>
                <p className="text-xs text-muted-foreground">간격 반복 복습</p>
              </div>
            </div>
            <div className="mt-3 rounded-xl bg-card/80 px-4 py-3">
              {isLoading ? (
                <div className="flex flex-col gap-1 animate-pulse">
                  <div className="h-7 w-12 rounded bg-muted" />
                  <div className="h-3 w-32 rounded bg-muted/60" />
                </div>
              ) : (
                <>
                  <p className="text-2xl font-extrabold text-foreground">
                    {totalTodayCards ?? 0}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(todayStacks?.length ?? 0) > 0
                      ? `${todayStacks!.length}개 스택에서 복습할 카드`
                      : '오늘 복습할 카드가 없습니다 🎉'}
                  </p>
                </>
              )}
            </div>
          </button>

          {/* Quick Add Card */}
          {(categories ?? []).length > 0 && (
            <button
              onClick={() => setShowQuickAdd(true)}
              className="flex w-[120px] flex-shrink-0 flex-col rounded-2xl bg-primary/10 p-5 text-left shadow-sm transition-transform active:scale-[0.98]"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
                <Plus className="h-5 w-5 text-primary" />
              </div>
              <div className="mt-3">
                <p className="text-sm font-bold text-foreground">새 카드</p>
                <p className="text-xs text-muted-foreground">오늘 바로 추가</p>
              </div>
            </button>
          )}
        </motion.div>

        {/* Today's Review Stacks Carousel */}
        {!isLoading && todayStacks && todayStacks.length > 0 && (
          <motion.section variants={itemVariants}>
            <h2 className="mb-3 text-base font-bold text-foreground">
              오늘 복습할 스택 🔥
            </h2>
            <div
              ref={dragScroll.ref}
              className="flex gap-3 overflow-x-auto pb-2 scrollbar-none scroll-fade select-none"
              style={{ cursor: 'grab' }}
              onMouseDown={dragScroll.onMouseDown}
              onMouseMove={dragScroll.onMouseMove}
              onMouseUp={dragScroll.onMouseUp}
              onMouseLeave={dragScroll.onMouseLeave}
              onClick={dragScroll.preventClickIfDragged}
            >
              {todayStacks.map((stack) => (
                <TodayStackCard
                  key={stack.id}
                  stack={stack}
                  categoryName={categoryMap.get(stack.categoryId)?.name ?? '...'}
                  cardCount={stackCounts?.[stack.id]}
                />
              ))}
            </div>
          </motion.section>
        )}

        {/* Categories */}
        <motion.section variants={itemVariants}>
          <h2 className="mb-3 text-base font-bold text-foreground">내 카테고리</h2>
          <div className="grid grid-cols-2 gap-3">
            {isLoading ? (
              // Loading skeletons
              <>
                <CategorySkeleton />
                <CategorySkeleton />
                <CategorySkeleton />
              </>
            ) : (
              <>
                {(categories ?? []).map((cat) => (
                  <CategoryCard key={cat.id} category={cat} cardCount={categoryCounts?.[cat.id]} />
                ))}
                <motion.button
                  variants={itemVariants}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setShowAddCategory(true)}
                  className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border p-5"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                    <Plus className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <span className="text-sm font-semibold text-muted-foreground">추가하기</span>
                </motion.button>
              </>
            )}
          </div>
        </motion.section>
      </motion.div>

      <AddCategoryModal open={showAddCategory} onClose={() => setShowAddCategory(false)} />
      <QuickAddCardModal
        open={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
        categories={categories ?? []}
      />
    </div>
  )
}
