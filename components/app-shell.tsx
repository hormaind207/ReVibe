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
import { WaitingView } from '@/components/screens/waiting-view'
import { StackDetails } from '@/components/screens/stack-details'
import { ReviewSession } from '@/components/screens/review-session'
import { StudySession } from '@/components/screens/study-session'
import { StatsScreen } from '@/components/screens/stats'
import { RankingScreen } from '@/components/screens/ranking'
import { ProfileScreen } from '@/components/screens/profile'
import { HelpGuideScreen } from '@/components/screens/help-guide'
import { SettingsScreen } from '@/components/screens/settings'
import { MarketplaceScreen } from '@/components/screens/marketplace'
import { TemplateDetailScreen } from '@/components/screens/template-detail'
import { MyTemplatesScreen } from '@/components/screens/my-templates'
import { MarketplaceHashtagScreen } from '@/components/screens/marketplace-hashtag'
import { MarketplaceAuthorScreen } from '@/components/screens/marketplace-author'
import { MarketplaceModerationScreen } from '@/components/screens/marketplace-moderation'
import { RankingModerationScreen } from '@/components/screens/ranking-moderation'
import { BugReportsAdminScreen } from '@/components/screens/bug-reports-admin'
import { MarketplaceSectionScreen } from '@/components/screens/marketplace-section'
import { Onboarding } from '@/components/onboarding'
import { InstallPwaBanner, shouldShowInstallPwaBanner } from '@/components/install-pwa-banner'
import { TopBannerStack } from '@/components/top-banner-stack'
import { RecommendMobileBanner } from '@/components/recommend-mobile-banner'
import { RecommendPortraitBanner } from '@/components/recommend-portrait-banner'
import { useIsDesktop, useIsLandscape } from '@/hooks/use-viewport'
import { useNotificationSnapshots } from '@/lib/hooks/use-notification-snapshots'
import {
  NotificationPromptBanner,
  shouldShowNotificationPrompt,
} from '@/components/notification-prompt-banner'
import { GuidePromptBanner } from '@/components/guide-prompt-banner'
import { shouldShowGuidePrompt, markGuideOpened } from '@/lib/app-guide-content'
import {
  enableMasterNotifications,
  getNotificationPreferences,
} from '@/lib/push-notifications'
import { useDriveOnAccessCheck } from '@/lib/hooks/use-drive-on-access-check'
import {
  getSyncFileModifiedTime,
  downloadSyncFileFromGDriveWithMeta,
  applyRemoteBackupAndAcknowledge,
  createManualBackup,
} from '@/lib/sync'
import { snoozeDriveConflict, clearSyncConflictPending } from '@/lib/hooks/use-sync-meta'
import { flushDriveSync, initDriveSyncEngine, withDriveSyncLock } from '@/lib/sync/sync-engine'
import { handleOverdueStacks } from '@/lib/leitner'
import { processStreakOnAppOpen } from '@/lib/streak'
import { consumeLeagueScoreError, getUnreadLeagueNotifications, markLeagueNotificationRead, type LeagueNotification } from '@/lib/ranking'
import { useMarketplaceUser } from '@/lib/marketplace/auth'
import { CloudOfflineGate } from '@/components/cloud-offline-gate'
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

function LeagueNotificationModal() {
  const { isFullUser } = useMarketplaceUser()
  const [queue, setQueue] = useState<LeagueNotification[]>([])
  const [current, setCurrent] = useState<LeagueNotification | null>(null)

  useEffect(() => {
    if (!isFullUser) return
    let active = true
    getUnreadLeagueNotifications().then((notifs) => {
      if (!active || notifs.length === 0) return
      setQueue(notifs)
      setCurrent(notifs[0] ?? null)
    })
    return () => { active = false }
  }, [isFullUser])

  const handleDismiss = async () => {
    if (!current) return
    await markLeagueNotificationRead(current.id)
    const rest = queue.filter(n => n.id !== current.id)
    setQueue(rest)
    setCurrent(rest[0] ?? null)
  }

  if (!current) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0">
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-md rounded-t-3xl bg-card p-6 pb-10 shadow-2xl"
      >
        <h3 className="mb-2 text-base font-bold text-foreground">
          {current.kind === 'ranking_blocked' ? '랭킹 안내' : '리그 트로피 안내'}
        </h3>
        <p className="mb-6 text-sm text-muted-foreground leading-relaxed">{current.message}</p>
        <button
          onClick={handleDismiss}
          className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground"
        >
          확인
        </button>
      </motion.div>
    </div>
  )
}

const ROOT_TAB_TYPES = new Set(['dashboard', 'marketplace', 'ranking', 'profile'])

function ScreenRouter() {
  const { screen } = useNavigation()
  const key = JSON.stringify(screen)
  const isRootTab = ROOT_TAB_TYPES.has(screen.type)
  const hideBottomNav = screen.type === 'review' || screen.type === 'study'
  const [leagueScoreError, setLeagueScoreError] = useState<string | null>(null)

  useEffect(() => {
    const msg = consumeLeagueScoreError()
    if (msg) {
      setLeagueScoreError(msg)
      const t = setTimeout(() => setLeagueScoreError(null), 3500)
      return () => clearTimeout(t)
    }
  }, [key])

  return (
    <>
      {leagueScoreError && (
        <div className="fixed left-4 right-4 top-4 z-[60] mx-auto max-w-md rounded-2xl bg-destructive px-4 py-3 text-center text-sm font-semibold text-destructive-foreground shadow-lg">
          {leagueScoreError}
        </div>
      )}

      {/* Bottom-nav root tabs — keep mounted to avoid refetch on tab switch */}
      <div hidden={screen.type !== 'dashboard'} aria-hidden={screen.type !== 'dashboard'}>
        <DashboardScreen />
      </div>
      <div hidden={screen.type !== 'marketplace'} aria-hidden={screen.type !== 'marketplace'}>
        <CloudOfflineGate feature="marketplace">
          <MarketplaceScreen />
        </CloudOfflineGate>
      </div>
      <div hidden={screen.type !== 'ranking'} aria-hidden={screen.type !== 'ranking'}>
        <CloudOfflineGate feature="ranking">
          <RankingScreen />
        </CloudOfflineGate>
      </div>
      <div hidden={screen.type !== 'profile'} aria-hidden={screen.type !== 'profile'}>
        <ProfileScreen />
      </div>

      {!isRootTab && (
        <AnimatePresence mode="wait">
          <motion.div
            key={key}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="min-h-screen min-h-dvh"
          >
            {screen.type === 'category' && <CategoryView categoryId={screen.categoryId} />}
            {screen.type === 'stage' && screen.stage === 0 && <WaitingView categoryId={screen.categoryId} />}
            {screen.type === 'stage' && screen.stage !== 0 && <StackSelection categoryId={screen.categoryId} stage={screen.stage} />}
            {screen.type === 'stack' && <StackDetails categoryId={screen.categoryId} stackId={screen.stackId} />}
            {screen.type === 'review' && <ReviewSession categoryId={screen.categoryId} stackId={screen.stackId} />}
            {screen.type === 'study' && (
              <StudySession
                categoryId={screen.categoryId}
                stackId={screen.stackId}
                random={screen.random}
              />
            )}
            {screen.type === 'stats' && <StatsScreen />}
            {screen.type === 'ranking-moderation' && (
              <CloudOfflineGate feature="ranking" title="랭킹 관리" showBack>
                <RankingModerationScreen />
              </CloudOfflineGate>
            )}
            {screen.type === 'help' && <HelpGuideScreen />}
            {screen.type === 'settings' && <SettingsScreen />}
            {screen.type === 'marketplace-template' && (
              <CloudOfflineGate feature="marketplace" title="템플릿" showBack>
                <TemplateDetailScreen templateId={screen.templateId} />
              </CloudOfflineGate>
            )}
            {screen.type === 'my-templates' && (
              <CloudOfflineGate feature="marketplace" title="나의 템플릿" showBack>
                <MyTemplatesScreen />
              </CloudOfflineGate>
            )}
            {screen.type === 'marketplace-hashtag' && (
              <CloudOfflineGate feature="marketplace" title={`#${screen.tag}`} showBack>
                <MarketplaceHashtagScreen tag={screen.tag} />
              </CloudOfflineGate>
            )}
            {screen.type === 'marketplace-section' && (
              <CloudOfflineGate feature="marketplace" showBack>
                <MarketplaceSectionScreen section={screen.section} />
              </CloudOfflineGate>
            )}
            {screen.type === 'marketplace-author' && (
              <CloudOfflineGate feature="marketplace" title="작성자" showBack>
                <MarketplaceAuthorScreen ownerId={screen.ownerId} />
              </CloudOfflineGate>
            )}
            {screen.type === 'marketplace-moderation' && (
              <CloudOfflineGate feature="marketplace" title="숨김 검토" showBack>
                <MarketplaceModerationScreen />
              </CloudOfflineGate>
            )}
            {screen.type === 'bug-reports-admin' && <BugReportsAdminScreen />}
          </motion.div>
        </AnimatePresence>
      )}
      {!hideBottomNav && <BottomNav />}
    </>
  )
}

function GuidePromptLauncher({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { navigate } = useNavigation()

  const handleReadGuide = () => {
    markGuideOpened()
    onClose()
    navigate({ type: 'help' })
  }

  return (
    <GuidePromptBanner
      open={open}
      onReadGuide={handleReadGuide}
      onLater={onClose}
    />
  )
}

function NotificationPromptLauncher({
  open,
  onClose,
  onEnabled,
  onMessage,
}: {
  open: boolean
  onClose: () => void
  onEnabled: () => void
  onMessage: (msg: string) => void
}) {
  const { navigate } = useNavigation()

  const handleEnable = async () => {
    const result = await enableMasterNotifications()
    onClose()
    if (result === 'granted') {
      onEnabled()
      onMessage('알림이 켜졌어요. 프로필에서 세부 설정을 조정할 수 있어요.')
      navigate({ type: 'profile' })
      return
    }
    if (result === 'denied') {
      onMessage('알림 권한이 거부되었어요. 브라우저 설정에서 허용해 주세요.')
      navigate({ type: 'profile' })
      return
    }
    if (result === 'no_vapid') {
      onMessage('알림 서버 설정이 완료되지 않았어요.')
      return
    }
    if (result === 'error') {
      onMessage('알림 설정 저장에 실패했어요. 네트워크를 확인하고 다시 시도해 주세요.')
      return
    }
    onMessage('이 브라우저에서는 알림을 사용할 수 없어요.')
  }

  return (
    <NotificationPromptBanner
      open={open}
      onEnable={handleEnable}
      onDismiss={onClose}
    />
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
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false)
  const [showGuidePrompt, setShowGuidePrompt] = useState(false)
  const isDesktop = useIsDesktop()
  const isLandscape = useIsLandscape()

  useNotificationSnapshots(dbState === 'ready')

  useEffect(() => {
    if (dbState !== 'ready') return
    return initDriveSyncEngine()
  }, [dbState])

  useDriveOnAccessCheck(
    dbState === 'ready',
    () => setShowDriveConflictModal(true),
    () => {
      setDriveConflictToast('Drive에서 최신 데이터를 불러왔습니다.')
      setTimeout(() => setDriveConflictToast(null), 2500)
    }
  )

  useEffect(() => {
    const onConflict = () => setShowDriveConflictModal(true)
    window.addEventListener('drive-sync-conflict', onConflict)
    return () => window.removeEventListener('drive-sync-conflict', onConflict)
  }, [])

  // 캐럿 테마는 라이트 모드만 지원 — 앱 로드 시 강제
  useEffect(() => {
    if (colorTheme === 'carat' && theme !== 'light') setTheme('light')
  }, [colorTheme, theme, setTheme])

  const handleKeepLocalAndSaveToDrive = async () => {
    setShowDriveConflictModal(false)
    try {
      // User explicitly chose to overwrite remote → clear the gate first.
      await clearSyncConflictPending()
      const ok = await flushDriveSync()
      if (!ok) throw new Error('upload failed')
    } catch {
      setDriveConflictToast('Drive 저장 중 오류가 발생했습니다.')
      setTimeout(() => setDriveConflictToast(null), 2500)
    }
  }

  const handlePullFromDrive = async () => {
    setShowDriveConflictModal(false)
    try {
      await withDriveSyncLock(async () => {
        const download = await downloadSyncFileFromGDriveWithMeta()
        if (!download) {
          setDriveConflictToast('Google Drive에 데이터가 없습니다.')
          setTimeout(() => setDriveConflictToast(null), 2500)
          setShowDriveConflictModal(true)
          return
        }
        await applyRemoteBackupAndAcknowledge(download.backup, download.modifiedTime)
      })
      setDriveConflictToast('Drive 데이터를 불러왔습니다.')
      setTimeout(() => setDriveConflictToast(null), 2500)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Drive 불러오기 중 오류가 발생했습니다.'
      setDriveConflictToast(msg)
      setTimeout(() => setDriveConflictToast(null), 2500)
      setShowDriveConflictModal(true)
    }
  }

  const handleConflictBackupFirst = async () => {
    try {
      await createManualBackup()
      setDriveConflictToast('현재 기기 데이터를 수동 백업했습니다.')
      setTimeout(() => setDriveConflictToast(null), 2500)
    } catch {
      setDriveConflictToast('수동 백업에 실패했습니다.')
      setTimeout(() => setDriveConflictToast(null), 2500)
    }
  }

  const handleConflictLater = async () => {
    setShowDriveConflictModal(false)
    try {
      const t = await getSyncFileModifiedTime()
      if (t) await snoozeDriveConflict(t)
    } catch { /* ignore */ }
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

  useEffect(() => {
    if (dbState !== 'ready') return
    const onFail = () => {
      setDriveConflictToast('Drive 저장에 실패했습니다. 네트워크를 확인해 주세요.')
      setTimeout(() => setDriveConflictToast(null), 2500)
    }
    const onTokenExpiring = () => {
      setDriveConflictToast('Drive 동기화 권한이 곧 만료됩니다. 프로필에서 「Drive 권한 갱신」을 해 주세요.')
      setTimeout(() => setDriveConflictToast(null), 4000)
    }
    window.addEventListener('drive-sync-failed', onFail)
    window.addEventListener('drive-token-expiring', onTokenExpiring)
    return () => {
      window.removeEventListener('drive-sync-failed', onFail)
      window.removeEventListener('drive-token-expiring', onTokenExpiring)
    }
  }, [dbState])

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

  // Guide prompt — after center modals (portrait/mobile) are dismissed
  useEffect(() => {
    if (dbState !== 'ready' || showOnboarding) return
    if (showRecommendPortrait || showRecommendMobile) return
    if (shouldShowGuidePrompt()) setShowGuidePrompt(true)
  }, [dbState, showOnboarding, showRecommendPortrait, showRecommendMobile])

  // Notification opt-in — after center modals are dismissed
  useEffect(() => {
    if (dbState !== 'ready' || showOnboarding) return
    if (showRecommendPortrait || showRecommendMobile) return
    if (!shouldShowNotificationPrompt()) return
    getNotificationPreferences()
      .then((prefs) => {
        if (!prefs.masterEnabled) setShowNotificationPrompt(true)
      })
      .catch(() => {})
  }, [dbState, showOnboarding, showRecommendPortrait, showRecommendMobile])

  // On app load: bump overdue stacks to today, then process streak (once per day)
  useEffect(() => {
    if (dbState !== 'ready') return
    handleOverdueStacks()
      .then(() => processStreakOnAppOpen())
      .catch(() => {})
  }, [dbState])

  const hasCenterModal = showRecommendPortrait || showRecommendMobile
  const showTopBanners =
    !showOnboarding &&
    !hasCenterModal &&
    (showInstallPwa || showGuidePrompt || showNotificationPrompt)

  if (dbState === 'loading') return <LoadingScreen />
  if (dbState === 'error') return <ErrorScreen />

  return (
    <>
      <NavigationProvider>
        <ScreenRouter />
        {showTopBanners && (
          <TopBannerStack>
            <InstallPwaBanner
              open={showInstallPwa}
              onClose={() => setShowInstallPwa(false)}
              onInstall={async () => { await triggerInstall() }}
              canInstallPrompt={canInstall}
            />
            <GuidePromptLauncher
              open={showGuidePrompt}
              onClose={() => setShowGuidePrompt(false)}
            />
            <NotificationPromptLauncher
              open={showNotificationPrompt}
              onClose={() => setShowNotificationPrompt(false)}
              onEnabled={() => setShowNotificationPrompt(false)}
              onMessage={(msg) => {
                setDriveConflictToast(msg)
                setTimeout(() => setDriveConflictToast(null), 3500)
              }}
            />
          </TopBannerStack>
        )}
      </NavigationProvider>
      <LeagueNotificationModal />
      {driveConflictToast && (
        <div className="fixed left-4 right-4 top-4 z-[60] rounded-xl bg-primary px-4 py-3 text-center text-sm font-medium text-primary-foreground shadow-lg">
          {driveConflictToast}
        </div>
      )}
      {showDriveConflictModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-4 shadow-lg">
            <p className="mb-1 text-sm font-bold text-foreground">Drive와 이 기기 둘 다 변경됨</p>
            <p className="mb-4 text-xs text-muted-foreground leading-relaxed">
              다른 기기에서도 데이터가 바뀌었고, 이 기기에서도 저장되지 않은 변경이 있습니다. 어느 쪽을 유지할지 선택해 주세요.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleKeepLocalAndSaveToDrive}
                className="rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground"
              >
                이 기기 데이터 유지 (Drive에 저장)
              </button>
              <button
                onClick={handlePullFromDrive}
                className="rounded-xl bg-muted py-2.5 text-sm font-medium text-foreground"
              >
                Drive 데이터 가져오기
              </button>
              <button
                onClick={handleConflictBackupFirst}
                className="rounded-xl border border-border py-2.5 text-sm font-medium text-foreground"
              >
                먼저 수동 백업 만들기
              </button>
              <button
                onClick={handleConflictLater}
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
      {!showOnboarding && showRecommendPortrait && (
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
      {!showOnboarding && !showRecommendPortrait && showRecommendMobile && (
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
