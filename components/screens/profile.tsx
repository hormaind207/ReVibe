'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useTheme } from 'next-themes'
import {
  User, Cloud, HelpCircle, Moon, Bell, BellOff, Layers, Palette, PlayCircle,
  Download, Upload, Trash2, Info, LogOut, RefreshCw, ChevronRight, Check, Pencil, Camera, X, Volume2, Code2, Trophy, Loader2, Flame, Heart, Bug,
} from 'lucide-react'
import { useNavigation } from '@/lib/store'
import { ScreenHeader } from '@/components/screen-header'
import { useSyncMeta, getSyncMeta, updateSyncMeta, resetDriveSyncMetaAfterDataClear } from '@/lib/hooks/use-sync-meta'
import { useDeveloperMode } from '@/lib/hooks/use-developer-mode'
import { signOutGoogleUnified, resolveProfileAvatarUrl, signInWithGoogleUnified, GOOGLE_JUST_CONNECTED_KEY, clearGoogleEverConnectedFlag } from '@/lib/google-auth'
import { getProfileTrophyCount, getRankingOptIn, setRankingOptIn } from '@/lib/ranking'
import { useMarketplaceUser } from '@/lib/marketplace/auth'
import { deleteUserCloudData } from '@/lib/marketplace/user-data'
import { clearDatabase } from '@/lib/seed'
import { db } from '@/lib/db'
import { GoogleSignInButton } from '@/components/google-sign-in-button'
import {
  deleteDriveBackup,
  downloadFromGDrive,
  downloadSyncFileFromGDriveWithMeta,
  applyRemoteBackupAndAcknowledge,
  getSyncFileModifiedTime,
  createManualBackup,
  listManualBackups,
  downloadManualBackup,
  deleteManualBackup,
  type ManualBackupItem,
} from '@/lib/sync'
import { scheduleDriveSync, flushDriveSync, withDriveSyncLock } from '@/lib/sync/sync-engine'
import { isLocalDataEmpty, syncOnAppOpen } from '@/lib/sync/sync-on-open'
import { useDriveSyncStatus, driveSyncStatusLabel } from '@/lib/hooks/use-drive-sync-status'
import type { DriveSyncStatus } from '@/lib/sync/sync-engine'
import { acknowledgeRemoteBaseline } from '@/lib/hooks/use-sync-meta'
import { useUserProfile, updateUserProfile } from '@/lib/hooks/use-user-profile'
import { DEFAULT_MAX_STAGES } from '@/lib/leitner'
import { useColorTheme, COLOR_THEMES } from '@/lib/color-theme'
import { Onboarding } from '@/components/onboarding'
import { markGuideOpened } from '@/lib/app-guide-content'
import {
  enableMasterNotifications,
  disableMasterNotifications,
  getNotificationPreferences,
  updateNotificationPreferences,
  sendTestPushNotification,
  flushNotificationSnapshots,
  markNotificationSnapshotsDirty,
  DEFAULT_REVIEW_HOUR,
  type NotificationPreferences,
} from '@/lib/push-notifications'
import { playButtonTap, playToggleSwitch, playNotificationChime } from '@/lib/sounds'
import { submitBugReport, BUG_REPORT_MAX_LENGTH } from '@/lib/bug-reports'

const APP_VERSION = '3.1.5'

function formatSyncTime(ts: number | null | undefined): string {
  if (!ts) return '없음'
  const d = new Date(ts)
  return d.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function exportData() {
  db.transaction('r', [db.categories, db.stacks, db.cards], async () => {
    const categories = await db.categories.toArray()
    const stacks = await db.stacks.toArray()
    const cards = await db.cards.toArray()
    const data = { version: 1, exportedAt: Date.now(), categories, stacks, cards }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `revibe-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  })
}

async function importData(file: File): Promise<{ ok: boolean; message: string }> {
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    if (!data.categories || !data.stacks || !data.cards) {
      return { ok: false, message: '올바른 ReVibe 백업 파일이 아닙니다.' }
    }
    await db.transaction('rw', [db.categories, db.stacks, db.cards], async () => {
      await db.categories.bulkPut(data.categories)
      await db.stacks.bulkPut(data.stacks)
      await db.cards.bulkPut(data.cards)
    })
    scheduleDriveSync()
    return { ok: true, message: `데이터 복원 완료 (카테고리 ${data.categories.length}개)` }
  } catch {
    return { ok: false, message: '파일 읽기 중 오류가 발생했습니다.' }
  }
}

interface SectionProps { title: string; children: React.ReactNode }
function Section({ title, children }: SectionProps) {
  return (
    <div className="flex flex-col gap-1">
      <p className="mb-1 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="overflow-hidden rounded-2xl bg-card shadow-sm">
        {children}
      </div>
    </div>
  )
}

interface RowProps {
  icon: React.ReactNode
  label: string
  description?: React.ReactNode
  right?: React.ReactNode
  onClick?: () => void
  danger?: boolean
  alignTop?: boolean
  hideChevron?: boolean
  dimmed?: boolean
}
function Row({ icon, label, description, right, onClick, danger, alignTop, hideChevron, dimmed }: RowProps) {
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper
      onClick={onClick}
      className={`flex w-full gap-3 px-4 py-3.5 ${alignTop ? 'items-start' : 'items-center'} ${onClick ? 'transition-colors active:bg-muted' : ''} ${dimmed ? 'opacity-50' : ''}`}
    >
      <span className={`shrink-0 ${alignTop ? 'mt-0.5' : ''} ${danger ? 'text-destructive' : 'text-muted-foreground'}`}>{icon}</span>
      <div className="min-w-0 flex-1 text-left">
        <p className={`text-sm font-semibold ${danger ? 'text-destructive' : 'text-foreground'}`}>{label}</p>
        {description && (
          typeof description === 'string'
            ? <p className="text-xs text-muted-foreground">{description}</p>
            : description
        )}
      </div>
      {right ?? (onClick && !hideChevron && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />)}
    </Wrapper>
  )
}

interface GoogleConnectionDetailsProps {
  email?: string | null
  marketplaceConfigured: boolean
  marketplaceConnected: boolean
  lastSyncedAt?: number | null
  syncStatus: DriveSyncStatus
  onManualSync?: () => void
  onDriveReauth?: () => void
  manualSyncBusy?: boolean
}

function GoogleConnectionDetails({
  email,
  marketplaceConfigured,
  marketplaceConnected,
  lastSyncedAt,
  syncStatus,
  onManualSync,
  onDriveReauth,
  manualSyncBusy,
}: GoogleConnectionDetailsProps) {
  const needsDriveReauth = syncStatus === 'no_token'
  const statusNeedsAction =
    syncStatus === 'pending' ||
    syncStatus === 'offline' ||
    syncStatus === 'error' ||
    needsDriveReauth

  return (
    <div className="mt-2 flex flex-col gap-2.5">
      {email && (
        <p className="truncate text-xs font-medium text-foreground/90">{email}</p>
      )}

      <div className="flex flex-wrap gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/20 bg-sky-500/[0.07] px-2 py-0.5 text-[11px] font-medium text-sky-900/85 dark:text-sky-200/90">
          <Check className="h-3 w-3 opacity-80" />
          Drive 동기화
        </span>
        {marketplaceConfigured && (
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
              marketplaceConnected
                ? 'border-teal-500/20 bg-teal-500/[0.07] text-teal-900/85 dark:text-teal-200/90'
                : 'border-border/70 bg-muted/40 text-muted-foreground'
            }`}
          >
            {marketplaceConnected ? <Check className="h-3 w-3 opacity-80" /> : null}
            {marketplaceConnected ? '마켓플레이스' : '마켓플레이스 미연동'}
          </span>
        )}
      </div>

      {needsDriveReauth && marketplaceConnected && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          마켓플레이스는 연결됐지만 Drive 권한 갱신이 필요합니다.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <p className={`text-xs ${statusNeedsAction ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}>
          {syncStatus === 'syncing' || manualSyncBusy ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              동기화 중…
            </span>
          ) : (
            driveSyncStatusLabel(syncStatus)
          )}
        </p>
        {needsDriveReauth && onDriveReauth && (
          <button
            type="button"
            onClick={onDriveReauth}
            disabled={manualSyncBusy}
            className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary disabled:opacity-50"
          >
            <RefreshCw className="h-3 w-3" />
            Drive 권한 갱신
          </button>
        )}
        {!needsDriveReauth && statusNeedsAction && onManualSync && (
          <button
            type="button"
            onClick={onManualSync}
            disabled={manualSyncBusy}
            className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary disabled:opacity-50"
          >
            <RefreshCw className="h-3 w-3" />
            지금 동기화
          </button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground/70">마지막 동기화</span>
        {' · '}
        {formatSyncTime(lastSyncedAt)}
      </p>

      <p className="w-fit max-w-full rounded-md bg-amber-500/10 px-2 py-1 text-[11px] leading-snug text-amber-800 dark:text-amber-300/90">
        두 기기 동시 접속 시 데이터가 꼬일 수 있습니다.
      </p>
    </div>
  )
}

function Divider() {
  return <div className="h-px bg-border mx-4" />
}

const AVATAR_EMOJIS = ['🧠', '📚', '✏️', '🎯', '🌟', '🦊', '🐬', '🦁', '🐧', '🌈', '🎮', '🎵', '🚀', '💡', '🌙', '☀️', '🍀', '🦋']

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? 'bg-primary' : 'bg-foreground/20'
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

export function ProfileScreen() {
  const { navigate } = useNavigation()
  const syncMeta = useSyncMeta()
  const userProfile = useUserProfile()
  const { theme, setTheme } = useTheme()
  const { colorTheme, setColorTheme } = useColorTheme()
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>({
    masterEnabled: false,
    reviewEnabled: false,
    reviewHour: DEFAULT_REVIEW_HOUR,
    streakEnabled: false,
    rankingEnabled: false,
    marketplaceLikesEnabled: false,
    timezone: 'Asia/Seoul',
  })
  const [notifPrefsLoading, setNotifPrefsLoading] = useState(true)
  const [defaultMaxStages, setDefaultMaxStages] = useState(DEFAULT_MAX_STAGES)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [clearConfirm, setClearConfirm] = useState(false)
  const [showBackupListModal, setShowBackupListModal] = useState(false)
  const [backupList, setBackupList] = useState<ManualBackupItem[]>([])
  const [backupListLoading, setBackupListLoading] = useState(false)
  const [showRestoreAfterConnectPrompt, setShowRestoreAfterConnectPrompt] = useState(false)
  const [showNmixxEasterEgg, setShowNmixxEasterEgg] = useState(false)
  const [showAppInfoModal, setShowAppInfoModal] = useState(false)
  const [showBugReportModal, setShowBugReportModal] = useState(false)
  const [bugReportBody, setBugReportBody] = useState('')
  const [bugReportSubmitting, setBugReportSubmitting] = useState(false)
  const [showDevPasswordModal, setShowDevPasswordModal] = useState(false)
  const [devPasswordInput, setDevPasswordInput] = useState('')
  const [devPasswordError, setDevPasswordError] = useState(false)
  const [devPasswordSubmitting, setDevPasswordSubmitting] = useState(false)
  const { enabled: developerMode, enable: enableDeveloperMode, disable: disableDeveloperMode } = useDeveloperMode()
  const [rankingOptIn, setRankingOptInState] = useState(true)
  const [rankingOptInLoading, setRankingOptInLoading] = useState(false)
  const { isFullUser: marketplaceConnected, configured: marketplaceConfigured, user: marketplaceUser } = useMarketplaceUser()
  const driveSyncStatus = useDriveSyncStatus()
  const [manualSyncBusy, setManualSyncBusy] = useState(false)
  const hasCheckedDriveAfterConnect = useRef(false)
  const [editingProfile, setEditingProfile] = useState(false)
  const [trophyCount, setTrophyCount] = useState(0)
  const [editNickname, setEditNickname] = useState('')
  const [editEmoji, setEditEmoji] = useState('')
  const [editImage, setEditImage] = useState<string | undefined>(undefined)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getNotificationPreferences()
      .then(setNotifPrefs)
      .finally(() => setNotifPrefsLoading(false))
    const saved = localStorage.getItem('defaultMaxStages')
    if (saved) setDefaultMaxStages(parseInt(saved, 10))
    setSoundEnabled(localStorage.getItem('sound_enabled') !== 'false')
  }, [])

  // 구글 연결 직후 Drive에 데이터가 있으면 불러올지 묻기 (마운트 시 플래그만 보고, DB는 getSyncMeta로 직접 읽어 타이밍 이슈 방지)
  useEffect(() => {
    if (typeof window === 'undefined' || sessionStorage.getItem(GOOGLE_JUST_CONNECTED_KEY) !== '1') return
    if (hasCheckedDriveAfterConnect.current) return
    hasCheckedDriveAfterConnect.current = true
    getSyncMeta()
      .then(async (meta) => {
        if (!meta?.googleEmail) return null
        const empty = await isLocalDataEmpty()
        if (empty) {
          return downloadFromGDrive()
        }
        const result = await syncOnAppOpen()
        if (result === 'conflict') {
          window.dispatchEvent(new CustomEvent('drive-sync-conflict'))
        } else if (result === 'pulled') {
          showToast('Drive에서 최신 데이터를 불러왔습니다.')
        }
        return null
      })
      .then((backup) => {
        if (backup && (backup.categories?.length > 0 || backup.stacks?.length > 0 || backup.cards?.length > 0)) {
          setShowRestoreAfterConnectPrompt(true)
        }
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Drive 확인 중 오류'
        showToast(msg)
      })
      .finally(() => {
        sessionStorage.removeItem(GOOGLE_JUST_CONNECTED_KEY)
      })
  }, [])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const handleBugReportSubmit = async () => {
    if (bugReportSubmitting) return
    playButtonTap()
    setBugReportSubmitting(true)
    const result = await submitBugReport(bugReportBody, {
      nickname: userProfile.nickname,
      appVersion: APP_VERSION,
    })
    setBugReportSubmitting(false)
    if (result === 'ok') {
      setShowBugReportModal(false)
      setBugReportBody('')
      showToast('제보가 접수되었습니다. 감사합니다.')
      return
    }
    if (result === 'rate_limit') {
      showToast('하루 제보는 5건까지 가능합니다.')
      return
    }
    if (result === 'empty') {
      showToast('내용을 입력해 주세요.')
      return
    }
    if (result === 'offline') {
      showToast('현재 버그 제보를 사용할 수 없습니다.')
      return
    }
    showToast('제보 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.')
  }

  const isDark = theme === 'dark'

  const handleEditProfileOpen = () => {
    if (isGoogleConnected) {
      showToast('Google 연동 중에는 프로필을 변경할 수 없습니다.')
      return
    }
    setEditNickname(userProfile.nickname)
    setEditEmoji(userProfile.avatarEmoji)
    setEditImage(userProfile.avatarImage)
    setEditingProfile(true)
  }

  const handleSaveProfile = async () => {
    if (isGoogleConnected) return
    await updateUserProfile({
      nickname: editNickname.trim() || '게스트',
      avatarEmoji: editEmoji,
      avatarImage: editImage,
    })
    setEditingProfile(false)
    showToast('프로필이 저장되었습니다.')
    scheduleDriveSync()
  }

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setEditImage(ev.target?.result as string)
    }
    reader.readAsDataURL(file)
    // reset input so same file can be re-selected
    e.target.value = ''
  }

  const handleThemeToggle = () => {
    playToggleSwitch()
    if (colorTheme === 'carat') return // 캐럿 테마는 라이트 모드만 지원
    setTheme(isDark ? 'light' : 'dark')
    scheduleDriveSync()
  }

  const handleNotifHourChange = async (h: number) => {
    setNotifPrefs((p) => ({ ...p, reviewHour: h }))
    const ok = await updateNotificationPreferences({ reviewHour: h })
    if (!ok) showToast('알림 시간 저장에 실패했습니다.')
    scheduleDriveSync()
  }

  const handleMasterNotificationToggle = async () => {
    if (notifPrefsLoading) return
    playToggleSwitch()
    if (!notifPrefs.masterEnabled) {
      const result = await enableMasterNotifications()
      if (result === 'granted') {
        const prefs = await getNotificationPreferences()
        setNotifPrefs(prefs)
        showToast('알림이 활성화되었습니다.')
      } else if (result === 'denied') {
        showToast('알림 권한이 거부되었습니다. 브라우저 설정에서 허용해 주세요.')
      } else if (result === 'no_vapid') {
        showToast('푸시 알림 설정이 완료되지 않았습니다. (VAPID 키 필요)')
      } else if (result === 'error') {
        showToast('알림 설정 저장에 실패했습니다. 네트워크를 확인해 주세요.')
      } else {
        showToast('이 브라우저는 알림을 지원하지 않습니다.')
      }
    } else {
      await disableMasterNotifications()
      setNotifPrefs({
        masterEnabled: false,
        reviewEnabled: false,
        reviewHour: notifPrefs.reviewHour,
        streakEnabled: false,
        rankingEnabled: false,
        marketplaceLikesEnabled: false,
        timezone: notifPrefs.timezone,
      })
      showToast('알림이 비활성화되었습니다.')
    }
  }

  const handleSubNotificationToggle = async (
    key: 'reviewEnabled' | 'streakEnabled' | 'rankingEnabled' | 'marketplaceLikesEnabled',
  ) => {
    if (!notifPrefs.masterEnabled || notifPrefsLoading) return
    playToggleSwitch()
    const next = !notifPrefs[key]
    const patch = { [key]: next } as Partial<NotificationPreferences>
    const ok = await updateNotificationPreferences(patch)
    if (ok) {
      setNotifPrefs((p) => ({ ...p, [key]: next }))
      if (next) {
        markNotificationSnapshotsDirty()
        flushNotificationSnapshots().catch(() => {})
      }
    } else {
      showToast('설정 저장에 실패했습니다.')
    }
  }

  const handleTestNotification = async () => {
    playNotificationChime()
    await sendTestPushNotification()
    showToast('테스트 알림을 전송했습니다.')
  }

  const handleDefaultMaxStagesChange = (val: number) => {
    setDefaultMaxStages(val)
    localStorage.setItem('defaultMaxStages', String(val))
    scheduleDriveSync()
  }

  const handleSoundToggle = () => {
    playToggleSwitch()
    const next = !soundEnabled
    setSoundEnabled(next)
    localStorage.setItem('sound_enabled', String(next))
    scheduleDriveSync()
  }

  const handleExport = () => {
    exportData()
    showToast('데이터 내보내기 완료!')
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const result = await importData(file)
    showToast(result.message)
    e.target.value = ''
  }

  const handleClearData = async () => {
    await clearDatabase()
    await deleteDriveBackup().catch(() => {})
    await resetDriveSyncMetaAfterDataClear()
    clearGoogleEverConnectedFlag()
    if (marketplaceUser?.id && !marketplaceUser.is_anonymous) {
      const ok = await deleteUserCloudData().catch(() => false)
      if (!ok) {
        showToast('로컬 데이터는 삭제됐지만 클라우드(마켓·랭킹) 삭제에 실패했습니다.')
        setClearConfirm(false)
        return
      }
      setRankingOptInState(false)
    }
    setClearConfirm(false)
    setNotifPrefs({
      masterEnabled: false,
      reviewEnabled: false,
      reviewHour: DEFAULT_REVIEW_HOUR,
      streakEnabled: false,
      rankingEnabled: false,
      marketplaceLikesEnabled: false,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
    showToast('모든 데이터가 삭제되었습니다.')
  }

  const handleGoogleSignOut = async () => {
    await signOutGoogleUnified()
    showToast('Google 계정 연결이 해제되었습니다. (Drive · 마켓플레이스)')
  }

  const handleDeveloperModeToggle = () => {
    if (developerMode) {
      playToggleSwitch()
      disableDeveloperMode()
      showToast('개발자 모드가 꺼졌습니다.')
      return
    }
    setDevPasswordInput('')
    setDevPasswordError(false)
    setShowDevPasswordModal(true)
  }

  const handleDevPasswordSubmit = async () => {
    setDevPasswordSubmitting(true)
    const ok = await enableDeveloperMode(devPasswordInput)
    setDevPasswordSubmitting(false)
    if (ok) {
      playToggleSwitch()
      setShowDevPasswordModal(false)
      setDevPasswordInput('')
      setDevPasswordError(false)
      showToast('개발자 모드가 켜졌습니다.')
    } else {
      setDevPasswordError(true)
    }
  }

  const handleRankingOptInToggle = async () => {
    if (!marketplaceUser?.id || rankingOptInLoading) return
    playToggleSwitch()
    const next = !rankingOptIn
    setRankingOptInLoading(true)
    const ok = await setRankingOptIn(marketplaceUser.id, next)
    setRankingOptInLoading(false)
    if (ok) {
      setRankingOptInState(next)
      showToast(next ? '랭킹 참여가 켜졌습니다.' : '랭킹 참여가 꺼졌습니다.')
    } else {
      showToast('설정 저장에 실패했습니다.')
    }
  }

  const handleManualBackup = async () => {
    try {
      const { label } = await createManualBackup()
      showToast(`${label} 백업으로 저장되었습니다.`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '수동 백업 중 오류가 발생했습니다.'
      showToast(msg)
    }
  }

  const openBackupListModal = () => {
    setShowBackupListModal(true)
    setBackupListLoading(true)
    setBackupList([])
    listManualBackups()
      .then(setBackupList)
      .catch(() => {
        setBackupList([])
        showToast('백업 목록을 불러올 수 없습니다.')
      })
      .finally(() => setBackupListLoading(false))
  }

  const handleManualDriveSync = async () => {
    setManualSyncBusy(true)
    try {
      const ok = await flushDriveSync()
      showToast(ok ? 'Drive에 동기화했습니다.' : '동기화에 실패했습니다. 네트워크를 확인해 주세요.')
    } finally {
      setManualSyncBusy(false)
    }
  }

  const handleDriveReauth = () => {
    playButtonTap()
    void signInWithGoogleUnified({ forceConsent: true })
  }

  const handleRestoreManualBackup = async (fileId: string) => {
    try {
      await withDriveSyncLock(async () => {
        const backup = await downloadManualBackup(fileId)
        await applyRemoteBackupAndAcknowledge(backup, null)
      })
      showToast('백업을 불러왔습니다.')
      setShowBackupListModal(false)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '백업 불러오기 중 오류가 발생했습니다.'
      showToast(msg)
    }
  }

  const handleDeleteManualBackup = async (fileId: string) => {
    try {
      await deleteManualBackup(fileId)
      setBackupList((prev) => prev.filter((b) => b.id !== fileId))
      showToast('백업을 삭제했습니다.')
    } catch (e) {
      const msg = e instanceof Error ? e.message : '백업 삭제 중 오류가 발생했습니다.'
      showToast(msg)
    }
  }

  const handleRestoreAfterConnect = async () => {
    setShowRestoreAfterConnectPrompt(false)
    try {
      let restored = false
      await withDriveSyncLock(async () => {
        const download = await downloadSyncFileFromGDriveWithMeta()
        if (!download) {
          showToast('Google Drive에 데이터가 없습니다.')
          return
        }
        await applyRemoteBackupAndAcknowledge(download.backup, download.modifiedTime)
        restored = true
      })
      if (restored) showToast('Google Drive 데이터를 불러왔습니다.')
    } catch (e) {
      const msg = e instanceof Error ? e.message : '백업 불러오기 중 오류가 발생했습니다.'
      showToast(msg)
    }
  }

  const isGoogleConnected = marketplaceConnected || !!syncMeta?.googleEmail
  const profileAvatarUrl = resolveProfileAvatarUrl(userProfile.avatarImage, marketplaceUser)

  useEffect(() => {
    if (isGoogleConnected) setEditingProfile(false)
  }, [isGoogleConnected])

  useEffect(() => {
    if (!marketplaceUser?.id) return
    getRankingOptIn(marketplaceUser.id).then(setRankingOptInState).catch(() => {})
  }, [marketplaceUser?.id])

  useEffect(() => {
    if (!marketplaceUser?.id) return
    getProfileTrophyCount(marketplaceUser.id).then(setTrophyCount).catch(() => {})
  }, [marketplaceUser?.id])

  return (
    <div className="flex flex-col pb-20">
      <ScreenHeader title="프로필 및 설정" showBack />

      <motion.div
        className="flex flex-col gap-5 px-4"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* 구글 연결 직후 Drive에 데이터가 있을 때 불러올지 묻는 모달 */}
        {showRestoreAfterConnectPrompt && (
          <div className="rounded-2xl bg-primary/10 p-4">
            <p className="mb-3 text-sm font-semibold text-foreground">
              구글 드라이브에 데이터가 있습니다. 데이터를 불러오시겠습니까?
            </p>
            <div className="flex gap-2">
              <button onClick={() => { playButtonTap(); handleRestoreAfterConnect() }} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground">예</button>
              <button
                onClick={async () => { playButtonTap();
                  setShowRestoreAfterConnectPrompt(false)
                  try {
                    const t = await getSyncFileModifiedTime()
                    if (t) await acknowledgeRemoteBaseline(t)
                  } catch { /* ignore */ }
                }}
                className="flex-1 rounded-xl bg-muted py-2.5 text-sm font-medium"
              >
                아니오
              </button>
            </div>
          </div>
        )}

        {/* Profile Card */}
        <div className="relative flex items-center gap-4 rounded-2xl bg-card p-5 shadow-sm">
          <button
            type="button"
            onClick={() => { playButtonTap(); setShowBugReportModal(true) }}
            className="absolute right-3 top-3 flex items-center gap-1 rounded-lg bg-muted/80 px-2 py-1 text-[10px] font-semibold text-muted-foreground transition-colors active:bg-muted"
            aria-label="버그 제보"
          >
            <Bug className="h-3 w-3 shrink-0" />
            버그 제보
          </button>
          <div className="relative">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 overflow-hidden">
              {profileAvatarUrl ? (
                <img
                  src={profileAvatarUrl}
                  alt="프로필 사진"
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="text-3xl">{userProfile.avatarEmoji}</span>
              )}
            </div>
            {!isGoogleConnected && (
              <button
                onClick={() => { playButtonTap(); handleEditProfileOpen() }}
                className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"
                aria-label="프로필 편집"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="flex-1">
            <p className="flex items-center gap-1 text-base font-bold text-foreground">
              {userProfile.nickname}
              {trophyCount > 0 && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-600">🏆{trophyCount}</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {isGoogleConnected
                ? `${syncMeta?.googleEmail} · Google 프로필`
                : 'Google 계정 미연결 · 프로필 직접 설정 가능'}
            </p>
          </div>
          {!isGoogleConnected && (
            <button
              onClick={() => { playButtonTap(); handleEditProfileOpen() }}
              className="mt-6 flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-xl bg-muted text-muted-foreground"
              aria-label="프로필 편집"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Profile Edit Panel */}
        {editingProfile && !isGoogleConnected && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl bg-card p-5 shadow-sm"
          >
            <h3 className="mb-4 text-sm font-bold text-foreground">프로필 편집</h3>
            <div className="flex flex-col gap-4">
              {/* Photo preview + upload */}
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-primary/20 overflow-hidden">
                  {editImage ? (
                    <img src={editImage} alt="미리보기" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-3xl">{editEmoji}</span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => { playButtonTap(); fileInputRef.current?.click() }}
                    className="flex items-center gap-2 rounded-xl bg-primary/15 px-3 py-2 text-xs font-semibold text-primary"
                  >
                    <Camera className="h-3.5 w-3.5" />사진 업로드
                  </button>
                  {editImage && (
                    <button
                      type="button"
                      onClick={() => { playButtonTap(); setEditImage(undefined) }}
                      className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-xs font-medium text-muted-foreground"
                    >
                      <X className="h-3.5 w-3.5" />사진 제거
                    </button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">닉네임</label>
                <input
                  value={editNickname}
                  onChange={e => setEditNickname(e.target.value)}
                  maxLength={20}
                  className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="닉네임 입력"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold text-muted-foreground">아바타 이모지 (사진 미사용 시)</label>
                <div className="grid grid-cols-9 gap-1.5">
                  {AVATAR_EMOJIS.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => { playButtonTap(); setEditEmoji(emoji); setEditImage(undefined) }}
                      className={`flex h-9 w-9 items-center justify-center rounded-xl text-xl transition-all ${
                        !editImage && editEmoji === emoji ? 'bg-primary/20 ring-2 ring-primary' : 'bg-muted hover:bg-primary/10'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { playButtonTap(); handleSaveProfile() }}
                  className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground"
                >
                  저장
                </button>
                <button
                  onClick={() => { playButtonTap(); setEditingProfile(false) }}
                  className="flex-1 rounded-xl bg-muted py-2.5 text-sm font-medium text-foreground"
                >
                  취소
                </button>
              </div>
            </div>
          </motion.div>
        )}

        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <p className="text-xs leading-relaxed text-foreground">
            <strong className="font-semibold">주의:</strong> 브라우저에서 쿠키 및 사이트 데이터를 삭제하면 이 기기의 모든 학습 데이터가 사라집니다. Google Drive 백업이나 JSON 내보내기로 미리 백업해 두세요.
          </p>
        </div>

        {/* Google 연결 */}
        <Section title="Google 연결">
          {isGoogleConnected ? (
            <>
              <Row
                icon={<Cloud className="h-5 w-5" />}
                label="Google 연결"
                alignTop
                description={
                  <GoogleConnectionDetails
                    email={syncMeta?.googleEmail ?? marketplaceUser?.email}
                    marketplaceConfigured={marketplaceConfigured}
                    marketplaceConnected={marketplaceConnected}
                    lastSyncedAt={syncMeta?.lastSyncedAt}
                    syncStatus={driveSyncStatus}
                    onManualSync={() => { playButtonTap(); handleManualDriveSync() }}
                    onDriveReauth={handleDriveReauth}
                    manualSyncBusy={manualSyncBusy}
                  />
                }
                right={
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-2 py-1 text-[10px] font-bold text-success">
                    <Check className="h-3 w-3" />연결됨
                  </span>
                }
              />
              <Divider />
              <Row
                icon={<Upload className="h-5 w-5" />}
                label="수동 백업"
                description="지금 시점을 날짜별 백업으로 Drive에 저장합니다"
                onClick={() => { playButtonTap(); handleManualBackup() }}
              />
              <Divider />
              <Row
                icon={<Download className="h-5 w-5" />}
                label="백업 불러오기"
                description="저장된 백업 목록에서 선택해 복원하거나 삭제합니다"
                onClick={() => { playButtonTap(); openBackupListModal() }}
              />
              <Divider />
              <Row
                icon={<LogOut className="h-5 w-5" />}
                label="Google 계정 해제"
                onClick={() => { playButtonTap(); handleGoogleSignOut() }}
                danger
              />
            </>
          ) : (
            <div className="p-4">
              <p className="mb-3 text-xs text-muted-foreground">
                Google 계정 하나로 Drive 동기화와 마켓플레이스를 함께 사용합니다.
              </p>
              <GoogleSignInButton />
            </div>
          )}
        </Section>

        {/* Backup list modal — 수동 백업 목록에서 선택 복원 또는 개별 삭제 */}
        {showBackupListModal && (
          <div className="rounded-2xl bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">저장된 백업</p>
              <button
                onClick={() => { playButtonTap(); setShowBackupListModal(false) }}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
                aria-label="닫기"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {backupListLoading ? (
              <p className="py-4 text-center text-sm text-muted-foreground">불러오는 중...</p>
            ) : backupList.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">저장된 백업이 없습니다.</p>
            ) : (
              <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                {backupList.map((item) => {
                  const label = (() => {
                    try {
                      const d = new Date(item.modifiedTime)
                      return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
                    } catch {
                      return item.name
                    }
                  })()
                  return (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-2 rounded-xl bg-muted/50 px-3 py-2.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{label}</span>
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          onClick={() => { playButtonTap(); handleRestoreManualBackup(item.id) }}
                          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
                        >
                          불러오기
                        </button>
                        <button
                          onClick={() => { playButtonTap(); handleDeleteManualBackup(item.id) }}
                          className="rounded-lg bg-destructive/15 px-3 py-1.5 text-xs font-medium text-destructive"
                        >
                          삭제
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}

        <Section title="앱 기본 설정">
          {/* 디스플레이 */}
          {colorTheme === 'carat' ? (
            <Row
              icon={<Moon className="h-5 w-5" />}
              label="다크 모드"
              description="캐럿 테마는 라이트 모드만 지원됩니다"
              right={<Toggle checked={false} onChange={() => {}} disabled />}
            />
          ) : (
            <Row
              icon={<Moon className="h-5 w-5" />}
              label="다크 모드"
              right={<Toggle checked={isDark} onChange={handleThemeToggle} />}
            />
          )}
          <Divider />
          <div className="px-4 py-3">
            <div className="mb-2 flex items-center gap-2">
              <Palette className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">테마 색상</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {COLOR_THEMES.map(theme => (
                <button
                  key={theme.id}
                  onClick={() => {
                    playButtonTap()
                    setColorTheme(theme.id)
                    if (theme.id === 'carat') setTheme('light')
                    scheduleDriveSync()
                  }}
                  className={`flex flex-col items-center gap-1 rounded-xl p-2 transition-all ${
                    colorTheme === theme.id ? 'ring-2 ring-primary ring-offset-2 bg-primary/10' : 'bg-muted'
                  }`}
                >
                  {'gradient' in theme ? (
                    <div
                      className="h-7 w-7 rounded-full shadow-sm overflow-hidden"
                      style={{
                        background: `linear-gradient(135deg, ${theme.gradient[0]} 0%, ${theme.gradient[0]} 50%, ${theme.gradient[1]} 50%, ${theme.gradient[1]} 100%)`,
                      }}
                    />
                  ) : (
                    <div className="h-7 w-7 rounded-full shadow-sm" style={{ backgroundColor: theme.color }} />
                  )}
                  <span className="text-[10px] font-semibold text-foreground">{theme.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 랭킹 참여 (리더보드 표시) */}
          {marketplaceConnected && (
            <>
              <Divider />
              <Row
                icon={<Trophy className="h-5 w-5" />}
                label="랭킹 참여"
                description={rankingOptIn ? '전체 랭킹에 표시됩니다' : '랭킹에 표시되지 않습니다'}
                right={
                  <Toggle
                    checked={rankingOptIn}
                    onChange={handleRankingOptInToggle}
                    disabled={rankingOptInLoading}
                  />
                }
              />
            </>
          )}

          <Divider />
          <Row
            icon={<Volume2 className="h-5 w-5" />}
            label="효과음"
            description="카드 플립, 성공/실패 등 효과음 재생"
            right={<Toggle checked={soundEnabled} onChange={handleSoundToggle} />}
          />
          <Divider />
          <div className="px-4 py-3">
            <div className="mb-2 flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">기본 단계 수</span>
              <span className="ml-auto text-sm font-bold text-primary">{defaultMaxStages}단계</span>
            </div>
            <input
              type="range" min={3} max={10} value={defaultMaxStages}
              onChange={e => handleDefaultMaxStagesChange(parseInt(e.target.value, 10))}
              className="w-full accent-primary"
            />
            <div className="mt-2 flex flex-wrap gap-1">
              {[3, 4, 5, 6, 7, 8, 10].map(n => (
                <button
                  key={n}
                  onClick={() => { playButtonTap(); handleDefaultMaxStagesChange(n) }}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    defaultMaxStages === n ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {n}단계
                </button>
              ))}
            </div>
            <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200">
              기본으로 설정된 7단계가 가장 효과적이므로, 변경하는 것을 추천하지 않습니다.
            </p>
          </div>
        </Section>

        <Section title="알림">
          <Row
            icon={notifPrefs.masterEnabled ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
            label="전체 알림"
            description="푸시 알림 설정·전송에는 네트워크 연결이 필요할 수 있습니다."
            right={
              <Toggle
                checked={notifPrefs.masterEnabled}
                onChange={handleMasterNotificationToggle}
                disabled={notifPrefsLoading}
              />
            }
          />
          <Divider />
          <Row
            icon={<Bell className="h-5 w-5" />}
            label="복습 알림"
            dimmed={!notifPrefs.masterEnabled}
            right={
              <Toggle
                checked={notifPrefs.reviewEnabled}
                onChange={() => handleSubNotificationToggle('reviewEnabled')}
                disabled={!notifPrefs.masterEnabled || notifPrefsLoading}
              />
            }
          />
          <Divider />
          <div className={`px-4 py-3 ${!notifPrefs.masterEnabled || !notifPrefs.reviewEnabled ? 'opacity-50' : ''}`}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">알림 시간</span>
              <span className="text-sm font-bold text-primary">
                {notifPrefs.reviewHour < 12
                  ? `오전 ${notifPrefs.reviewHour}시`
                  : notifPrefs.reviewHour === 12
                    ? '오후 12시'
                    : `오후 ${notifPrefs.reviewHour - 12}시`}
              </span>
            </div>
            <input
              type="range"
              min={6}
              max={22}
              value={notifPrefs.reviewHour}
              onChange={(e) => handleNotifHourChange(parseInt(e.target.value, 10))}
              className="w-full accent-primary"
              disabled={!notifPrefs.masterEnabled || !notifPrefs.reviewEnabled}
            />
            <div className="mt-1 flex flex-wrap gap-1">
              {[7, 8, 9, 12, 18, 20].map((h) => (
                <button
                  key={h}
                  onClick={() => { playButtonTap(); handleNotifHourChange(h) }}
                  disabled={!notifPrefs.masterEnabled || !notifPrefs.reviewEnabled}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-40 ${
                    notifPrefs.reviewHour === h
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {h < 12 ? `오전 ${h}시` : h === 12 ? '오후 12시' : `오후 ${h - 12}시`}
                </button>
              ))}
            </div>
          </div>
          <Divider />
          <Row
            icon={<Flame className="h-5 w-5" />}
            label="스트릭 알림"
            description="복습 알림과 같은 시간"
            dimmed={!notifPrefs.masterEnabled}
            right={
              <Toggle
                checked={notifPrefs.streakEnabled}
                onChange={() => handleSubNotificationToggle('streakEnabled')}
                disabled={!notifPrefs.masterEnabled || notifPrefsLoading}
              />
            }
          />
          <Divider />
          <Row
            icon={<Trophy className="h-5 w-5" />}
            label="친구 랭킹 추월"
            dimmed={!notifPrefs.masterEnabled}
            right={
              <Toggle
                checked={notifPrefs.rankingEnabled}
                onChange={() => handleSubNotificationToggle('rankingEnabled')}
                disabled={!notifPrefs.masterEnabled || notifPrefsLoading}
              />
            }
          />
          <Divider />
          <Row
            icon={<Heart className="h-5 w-5" />}
            label="마켓플레이스 좋아요"
            dimmed={!notifPrefs.masterEnabled}
            right={
              <Toggle
                checked={notifPrefs.marketplaceLikesEnabled}
                onChange={() => handleSubNotificationToggle('marketplaceLikesEnabled')}
                disabled={!notifPrefs.masterEnabled || notifPrefsLoading}
              />
            }
          />
          {notifPrefs.masterEnabled && (
            <>
              <Divider />
              <Row
                icon={<Bell className="h-5 w-5" />}
                label="테스트 알림 보내기"
                onClick={() => { playButtonTap(); handleTestNotification() }}
              />
            </>
          )}
        </Section>

        {/* Data Management */}
        <Section title="데이터 관리">
          <Row
            icon={<Download className="h-5 w-5" />}
            label="데이터 내보내기"
            description="JSON 파일로 백업"
            onClick={() => { playButtonTap(); handleExport() }}
          />
          <Divider />
          <label className="flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors active:bg-muted">
            <span className="text-muted-foreground"><Upload className="h-5 w-5" /></span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">데이터 가져오기</p>
              <p className="text-xs text-muted-foreground">JSON 백업 파일에서 복원</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
            <input type="file" accept=".json" className="hidden" onChange={handleImportFile} />
          </label>
        </Section>

        {/* Help & About */}
        <Section title="도움말 및 정보">
          <Row
            icon={<HelpCircle className="h-5 w-5" />}
            label="완전 가이드"
            description="모든 기능 설명"
            onClick={() => { playButtonTap(); markGuideOpened(); navigate({ type: 'help' }) }}
          />
          <Divider />
          <Row
            icon={<PlayCircle className="h-5 w-5" />}
            label="앱 소개 다시 보기"
            description="앱이 무엇인지 소개 (짧은 버전)"
            onClick={() => { playButtonTap(); setShowOnboarding(true) }}
          />
          <Divider />
          <Row
            icon={<Info className="h-5 w-5" />}
            label="앱 정보"
            description={`ReVibe v${APP_VERSION} · © hormaind207`}
            hideChevron
            onClick={() => { playButtonTap(); setShowAppInfoModal(true) }}
          />
        </Section>

        <div className="opacity-40">
          <Section title="개발자">
            <Row
              icon={<Code2 className="h-4 w-4 text-muted-foreground/60" />}
              label="개발자 모드"
              description={developerMode ? '관리 도구' : undefined}
              right={<Toggle checked={developerMode} onChange={handleDeveloperModeToggle} />}
            />
            {developerMode && (
              <>
                <Divider />
                <Row
                  icon={<Bug className="h-4 w-4 text-muted-foreground/60" />}
                  label="제보된 버그"
                  description="사용자 버그 제보 목록"
                  onClick={() => { playButtonTap(); navigate({ type: 'bug-reports-admin' }) }}
                />
              </>
            )}
          </Section>
        </div>

        {/* 모든 데이터 삭제 — 맨 아래에 배치하여 실수 접근 방지 */}
        <Section title="위험 구역">
          <Row
            icon={<Trash2 className="h-5 w-5" />}
            label="모든 데이터 삭제"
            description="되돌릴 수 없습니다"
            onClick={() => { playButtonTap(); setClearConfirm(true) }}
            danger
          />
        </Section>

        {/* Clear Confirm — 삭제 버튼 바로 아래에 배치 */}
        {clearConfirm && (
          <div className="rounded-2xl bg-destructive/10 p-4">
            <p className="mb-3 text-sm font-semibold text-destructive">모든 카테고리, 스택, 카드를 삭제할까요?</p>
            <div className="flex gap-2">
              <button onClick={() => { playButtonTap(); handleClearData() }} className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-bold text-white">삭제</button>
              <button onClick={() => { playButtonTap(); setClearConfirm(false) }} className="flex-1 rounded-xl bg-muted py-2.5 text-sm font-medium">취소</button>
            </div>
          </div>
        )}
      </motion.div>

      {showDevPasswordModal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowDevPasswordModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-1 text-base font-bold text-foreground">개발자 모드</p>
            <p className="mb-4 text-sm text-muted-foreground">비밀번호를 입력하면 개발자 모드가 켜집니다.</p>
            <input
              type="password"
              value={devPasswordInput}
              onChange={(e) => { setDevPasswordInput(e.target.value); setDevPasswordError(false) }}
              onKeyDown={(e) => e.key === 'Enter' && handleDevPasswordSubmit()}
              placeholder="비밀번호"
              className={`mb-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 ${devPasswordError ? 'border-destructive' : 'border-border'}`}
              autoFocus
            />
            {devPasswordError && (
              <p className="mb-3 text-xs text-destructive">비밀번호가 올바르지 않습니다.</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleDevPasswordSubmit}
                disabled={devPasswordSubmitting}
                className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {devPasswordSubmitting ? '확인 중...' : '확인'}
              </button>
              <button
                onClick={() => { playButtonTap(); setShowDevPasswordModal(false) }}
                className="flex-1 rounded-xl bg-muted py-2.5 text-sm font-medium text-foreground"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {showOnboarding && (
        <Onboarding onComplete={() => setShowOnboarding(false)} />
      )}

      {showBugReportModal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          onClick={() => !bugReportSubmitting && setShowBugReportModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="버그 제보"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-bold text-foreground">버그 제보</p>
            <p className="mt-1 text-xs text-muted-foreground">
              겪은 문제를 알려 주세요. 하루 5건까지, {BUG_REPORT_MAX_LENGTH}자 이내로 작성할 수 있습니다.
            </p>
            <textarea
              value={bugReportBody}
              onChange={(e) => setBugReportBody(e.target.value.slice(0, BUG_REPORT_MAX_LENGTH))}
              maxLength={BUG_REPORT_MAX_LENGTH}
              rows={6}
              placeholder="어떤 화면에서, 어떤 동작을 했을 때 문제가 생겼는지 적어 주세요."
              className="mt-3 w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/40"
              disabled={bugReportSubmitting}
            />
            <p className="mt-1 text-right text-[11px] text-muted-foreground">
              {bugReportBody.length}/{BUG_REPORT_MAX_LENGTH}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleBugReportSubmit}
                disabled={bugReportSubmitting || !bugReportBody.trim()}
                className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {bugReportSubmitting ? '전송 중...' : '제출'}
              </button>
              <button
                type="button"
                onClick={() => { playButtonTap(); setShowBugReportModal(false) }}
                disabled={bugReportSubmitting}
                className="flex-1 rounded-xl bg-muted py-2.5 text-sm font-medium text-foreground disabled:opacity-50"
              >
                취소
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {showAppInfoModal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowAppInfoModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="앱 정보"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-bold text-foreground">ReVibe</p>
            <p className="mt-1 text-sm text-muted-foreground">버전 {APP_VERSION}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">© hormaind207</p>
            <button
              type="button"
              onClick={() => {
                playButtonTap()
                setShowAppInfoModal(false)
                setShowNmixxEasterEgg(true)
              }}
              className="mt-4 w-full rounded-xl bg-muted py-2.5 text-sm font-semibold text-foreground"
            >
              ㄴ섞기
            </button>
            <button
              type="button"
              onClick={() => { playButtonTap(); setShowAppInfoModal(false) }}
              className="mt-2 w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground"
            >
              닫기
            </button>
          </motion.div>
        </div>
      )}

      {/* NMIXX easter egg — 돌고래가 팝업 위로 그대로 지나감 (멈추지 않음) */}
      {showNmixxEasterEgg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowNmixxEasterEgg(false)}
          role="dialog"
          aria-modal="true"
          aria-label="NMIXX"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            className="rounded-2xl bg-card px-8 py-6 text-center shadow-xl relative z-[51]"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-xl font-bold text-foreground">NMIXX!</p>
            <button
              type="button"
              onClick={() => { playButtonTap(); setShowNmixxEasterEgg(false) }}
              className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              닫기
            </button>
          </motion.div>
          <motion.span
            className="pointer-events-none fixed left-0 top-1/2 -translate-y-1/2 text-8xl sm:text-9xl drop-shadow-lg z-[52]"
            style={{ willChange: 'transform' }}
            initial={{ x: '-120%', y: 0 }}
            animate={{
              x: '220%',
              y: [0, 20, -20, 20, -20, 20, -20, 0],
            }}
            transition={{
              duration: 1.2,
              x: { ease: 'linear' },
              y: { ease: 'easeInOut' },
            }}
          >
            🐬
          </motion.span>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="fixed bottom-24 left-4 right-4 z-50 mx-auto max-w-md rounded-2xl bg-foreground px-4 py-3 text-center text-sm font-semibold text-background shadow-lg"
        >
          {toast}
        </motion.div>
      )}
    </div>
  )
}
