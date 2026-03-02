'use client'

import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { AnimatePresence, motion } from 'framer-motion'
import { NavigationProvider, useNavigation } from '@/lib/store'
import { useColorTheme } from '@/lib/color-theme'
import { DBReadyProvider, useDBReady } from '@/lib/db-ready-context'
import { BottomNav } from '@/components/bottom-nav'
import { DashboardScreen } from '@/components/screens/dashboard'
import { CategoryView } from '@/components/screens/category-view'
import { StackSelection } from '@/components/screens/stack-selection'
import { StackDetails } from '@/components/screens/stack-details'
import { ReviewSession } from '@/components/screens/review-session'
import { StatsScreen } from '@/components/screens/stats'
import { ProfileScreen } from '@/components/screens/profile'
import { HelpGuideScreen } from '@/components/screens/help-guide'
import { SettingsScreen } from '@/components/screens/settings'
import { Onboarding } from '@/components/onboarding'
import { InstallPwaBanner, shouldShowInstallPwaBanner } from '@/components/install-pwa-banner'
import { RecommendMobileBanner } from '@/components/recommend-mobile-banner'
import { RecommendPortraitBanner } from '@/components/recommend-portrait-banner'
import { useIsDesktop, useIsLandscape } from '@/hooks/use-viewport'
import { useNotificationRestore, sendOverdueNotification } from '@/lib/hooks/use-notifications'
import { useDriveOnAccessCheck } from '@/lib/hooks/use-drive-on-access-check'
import {
  uploadToGDrive,
  getSyncFileModifiedTime,
  downloadSyncFileFromGDrive,
  applyRemoteDataToLocal,
} from '@/lib/sync'
import { updateSyncMeta } from '@/lib/hooks/use-sync-meta'
import { handleOverdueStacks } from '@/lib/leitner'
import { processStreakOnAppOpen } from '@/lib/streak'
import { useIsPwa, useDeferredInstallPrompt } from '@/lib/use-pwa-install'

const pageVariants = {
  initial: { opacity: 0, x: 40 },
  animate: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 300, damping: 28 } },
  exit: { opacity: 0, x: -40, transition: { duration: 0.15 } },
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen min-h-dvh flex-col items-center justify-center gap-4 bg-background">
      <motion.div
        animate={{ scale: [1, 1.08, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
        className="flex h-20 w-20 items-center justify-center"
      >
        <img src="/icon.png" alt="ReVibe" className="h-full w-full object-contain" />
      </motion.div>
      <p className="text-sm font-semibold text-muted-foreground">ReVibe 불러오는 중...</p>
    </div>
  )
}

function ErrorScreen() {
  return (
    <div className="flex min-h-screen min-h-dvh flex-col items-center justify-center gap-4 px-8 bg-background">
      <span className="text-4xl">⚠️</span>
      <p className="text-center text-sm font-semibold text-foreground">데이터베이스를 열지 못했습니다.</p>
      <p className="text-center text-xs text-muted-foreground">브라우저를 새로고침하거나 개인정보 보호 모드가 아닌지 확인해 주세요.</p>
      <button
        onClick={() => window.location.reload()}
        className="mt-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"
      >
        새로고침
      </button>
    </div>
  )
}

function ScreenRouter() {
  const { screen } = useNavigation()
  const key = JSON.stringify(screen)
  const hideBottomNav = screen.type === 'review'

  return (
    <>
      <AnimatePresence mode="wait">
        <motion.div
          key={key}
          variants={pageVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="min-h-screen min-h-dvh"
        >
          {screen.type === 'dashboard' && <DashboardScreen />}
          {screen.type === 'category' && <CategoryView categoryId={screen.categoryId} />}
          {screen.type === 'stage' && <StackSelection categoryId={screen.categoryId} stage={screen.stage} />}
          {screen.type === 'stack' && <StackDetails categoryId={screen.categoryId} stackId={screen.stackId} />}
          {screen.type === 'review' && <ReviewSession categoryId={screen.categoryId} stackId={screen.stackId} />}
          {screen.type === 'stats' && <StatsScreen />}
          {screen.type === 'profile' && <ProfileScreen />}
          {screen.type === 'help' && <HelpGuideScreen />}
          {screen.type === 'settings' && <SettingsScreen />}
        </motion.div>
      </AnimatePresence>
      {!hideBottomNav && <BottomNav />}
    </>
  )
}

function AppContent() {
  const dbState = useDBReady()
  const isPwa = useIsPwa()
  const { theme, setTheme } = useTheme()
  const { colorTheme } = useColorTheme()
  const { canInstall, triggerInstall } = useDeferredInstallPrompt()
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showInstallPwa, setShowInstallPwa] = useState(false)
  const [showRecommendPortrait, setShowRecommendPortrait] = useState(false)
  const [showRecommendMobile, setShowRecommendMobile] = useState(false)
  const [showDriveConflictModal, setShowDriveConflictModal] = useState(false)
  const [driveConflictToast, setDriveConflictToast] = useState<string | null>(null)
  const isDesktop = useIsDesktop()
  const isLandscape = useIsLandscape()

  useNotificationRestore()
  useDriveOnAccessCheck(dbState === 'ready', () => setShowDriveConflictModal(true))

  // 캐럿 테마는 라이트 모드만 지원 — 앱 로드 시 강제
  useEffect(() => {
    if (colorTheme === 'carat' && theme !== 'light') setTheme('light')
  }, [colorTheme, theme, setTheme])

  const handleKeepLocalAndSaveToDrive = async () => {
    setShowDriveConflictModal(false)
    try {
      await uploadToGDrive()
      const t = await getSyncFileModifiedTime()
      if (t) await updateSyncMeta({ lastKnownRemoteModifiedTime: t })
    } catch {
      setDriveConflictToast('Drive 저장 중 오류가 발생했습니다.')
      setTimeout(() => setDriveConflictToast(null), 2500)
    }
  }

  const handlePullFromDrive = async () => {
    setShowDriveConflictModal(false)
    try {
      const backup = await downloadSyncFileFromGDrive()
      if (!backup) return
      await applyRemoteDataToLocal(backup)
      const t = await getSyncFileModifiedTime()
      if (t) await updateSyncMeta({ lastKnownRemoteModifiedTime: t })
      setDriveConflictToast('Drive 데이터를 불러왔습니다.')
      setTimeout(() => setDriveConflictToast(null), 2500)
    } catch {
      setDriveConflictToast('Drive 불러오기 중 오류가 발생했습니다.')
      setTimeout(() => setDriveConflictToast(null), 2500)
    }
  }

  useEffect(() => {
    const done = localStorage.getItem('onboarding_done')
    if (!done) setShowOnboarding(true)
  }, [])

  useEffect(() => {
    if (isPwa) {
      setShowInstallPwa(false)
      return
    }
    if (shouldShowInstallPwaBanner()) setShowInstallPwa(true)
  }, [isPwa])

  // Show recommend-portrait (landscape) or recommend-mobile (desktop) once viewport is known; portrait has priority
  useEffect(() => {
    if (isLandscape === undefined || isDesktop === undefined) return
    if (isLandscape === true && localStorage.getItem('recommend_portrait_dismissed') !== 'true') {
      setShowRecommendPortrait(true)
      return
    }
    if (isDesktop === true && localStorage.getItem('recommend_mobile_dismissed') !== 'true') {
      setShowRecommendMobile(true)
    }
  }, [isLandscape, isDesktop])

  // On app load: bump overdue stacks to today, send reminder if any, then process streak (once per day)
  useEffect(() => {
    if (dbState !== 'ready') return
    handleOverdueStacks()
      .then((count) => {
        if (count > 0) {
          sendOverdueNotification(count).catch(() => {})
        }
      })
      .then(() => processStreakOnAppOpen())
      .catch(() => {})
  }, [dbState])

  if (dbState === 'loading') return <LoadingScreen />
  if (dbState === 'error') return <ErrorScreen />

  return (
    <>
      <NavigationProvider>
        <ScreenRouter />
      </NavigationProvider>
      {driveConflictToast && (
        <div className="fixed left-4 right-4 top-4 z-[60] rounded-xl bg-primary px-4 py-3 text-center text-sm font-medium text-primary-foreground shadow-lg">
          {driveConflictToast}
        </div>
      )}
      {showDriveConflictModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-4 shadow-lg">
            <p className="mb-4 text-sm font-semibold text-foreground">
              Drive 데이터가 기기와 다릅니다. 기기 데이터를 Drive에 저장할까요, 아니면 Drive 데이터를 가져올까요?
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleKeepLocalAndSaveToDrive}
                className="rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground"
              >
                기기 데이터 유지하고 Drive에 저장
              </button>
              <button
                onClick={handlePullFromDrive}
                className="rounded-xl bg-muted py-2.5 text-sm font-medium text-foreground"
              >
                Drive 데이터 가져오기
              </button>
              <button
                onClick={() => setShowDriveConflictModal(false)}
                className="rounded-xl py-2.5 text-sm text-muted-foreground"
              >
                나중에
              </button>
            </div>
          </div>
        </div>
      )}
      {showOnboarding && (
        <Onboarding onComplete={() => setShowOnboarding(false)} />
      )}
      {!showOnboarding && showInstallPwa && (
        <InstallPwaBanner
          open
          onClose={() => setShowInstallPwa(false)}
          onInstall={async () => { await triggerInstall() }}
          canInstallPrompt={canInstall}
        />
      )}
      {!showOnboarding && !showInstallPwa && showRecommendPortrait && (
        <RecommendPortraitBanner
          open
          onClose={() => {
            setShowRecommendPortrait(false)
            if (isDesktop === true && typeof window !== 'undefined' && localStorage.getItem('recommend_mobile_dismissed') !== 'true') {
              setShowRecommendMobile(true)
            }
          }}
        />
      )}
      {!showOnboarding && !showInstallPwa && !showRecommendPortrait && showRecommendMobile && (
        <RecommendMobileBanner open onClose={() => setShowRecommendMobile(false)} />
      )}
    </>
  )
}

export function AppShell() {
  const { colorTheme } = useColorTheme()
  return (
    <DBReadyProvider>
      <div className={`mx-auto min-h-screen min-h-dvh max-w-md ${colorTheme === 'carat' ? 'bg-transparent' : 'bg-background'}`}>
        <AppContent />
      </div>
    </DBReadyProvider>
  )
}
