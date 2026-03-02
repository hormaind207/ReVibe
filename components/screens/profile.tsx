'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useTheme } from 'next-themes'
import {
  User, Cloud, HelpCircle, Moon, Sun, Bell, BellOff, Layers, Palette, PlayCircle, Code2, BookOpen,
  Download, Upload, Trash2, Info, LogOut, RefreshCw, ChevronRight, Check, Pencil, Camera, X, Volume2,
} from 'lucide-react'
import { useNavigation } from '@/lib/store'
import { ScreenHeader } from '@/components/screen-header'
import { useSyncMeta, getSyncMeta, updateSyncMeta, clearGoogleAuth } from '@/lib/hooks/use-sync-meta'
import { clearDatabase } from '@/lib/seed'
import { db } from '@/lib/db'
import { GoogleSignInButton } from '@/components/google-sign-in-button'
import {
  deleteDriveBackup,
  uploadToGDrive,
  downloadFromGDrive,
  downloadSyncFileFromGDrive,
  applyRemoteDataToLocal,
  getSyncFileModifiedTime,
  createManualBackup,
  listManualBackups,
  downloadManualBackup,
  deleteManualBackup,
  type ManualBackupItem,
} from '@/lib/sync'
import { useUserProfile, updateUserProfile } from '@/lib/hooks/use-user-profile'
import { DEFAULT_MAX_STAGES } from '@/lib/leitner'
import { useColorTheme, COLOR_THEMES } from '@/lib/color-theme'
import { Onboarding } from '@/components/onboarding'
import {
  enableNotifications,
  disableNotifications,
  sendTestNotification,
  getNotificationSettings,
  updateNotificationTime,
  DEFAULT_NOTIFICATION_HOUR,
  DEFAULT_NOTIFICATION_MINUTE,
} from '@/lib/hooks/use-notifications'
import { playButtonTap, playToggleSwitch, playNotificationChime } from '@/lib/sounds'

const APP_VERSION = '1.0.0'

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
    await uploadToGDrive().catch(() => {})
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
  description?: string
  right?: React.ReactNode
  onClick?: () => void
  danger?: boolean
}
function Row({ icon, label, description, right, onClick, danger }: RowProps) {
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3.5 ${onClick ? 'transition-colors active:bg-muted' : ''}`}
    >
      <span className={danger ? 'text-destructive' : 'text-muted-foreground'}>{icon}</span>
      <div className="flex-1 text-left">
        <p className={`text-sm font-semibold ${danger ? 'text-destructive' : 'text-foreground'}`}>{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {right ?? (onClick && <ChevronRight className="h-4 w-4 text-muted-foreground/50" />)}
    </Wrapper>
  )
}

function Divider() {
  return <div className="h-px bg-border mx-4" />
}

const AVATAR_EMOJIS = ['🧠', '📚', '✏️', '🎯', '🌟', '🦊', '🐬', '🦁', '🐧', '🌈', '🎮', '🎵', '🚀', '💡', '🌙', '☀️', '🍀', '🦋']

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${
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
  const [notifications, setNotifications] = useState(false)
  const [notifHour, setNotifHour] = useState(DEFAULT_NOTIFICATION_HOUR)
  const [defaultMaxStages, setDefaultMaxStages] = useState(DEFAULT_MAX_STAGES)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [devMode, setDevMode] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [clearConfirm, setClearConfirm] = useState(false)
  const [showBackupListModal, setShowBackupListModal] = useState(false)
  const [backupList, setBackupList] = useState<ManualBackupItem[]>([])
  const [backupListLoading, setBackupListLoading] = useState(false)
  const [showRestoreAfterConnectPrompt, setShowRestoreAfterConnectPrompt] = useState(false)
  const [showNmixxEasterEgg, setShowNmixxEasterEgg] = useState(false)
  const hasCheckedDriveAfterConnect = useRef(false)
  const [editingProfile, setEditingProfile] = useState(false)
  const [editNickname, setEditNickname] = useState('')
  const [editEmoji, setEditEmoji] = useState('')
  const [editImage, setEditImage] = useState<string | undefined>(undefined)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const { enabled, hour } = getNotificationSettings()
    setNotifications(enabled)
    setNotifHour(hour)
    const saved = localStorage.getItem('defaultMaxStages')
    if (saved) setDefaultMaxStages(parseInt(saved, 10))
    setSoundEnabled(localStorage.getItem('sound_enabled') !== 'false')
    setDevMode(localStorage.getItem('dev_mode') === 'true')
  }, [])

  // 구글 연결 직후 Drive에 데이터가 있으면 불러올지 묻기 (마운트 시 플래그만 보고, DB는 getSyncMeta로 직접 읽어 타이밍 이슈 방지)
  useEffect(() => {
    if (typeof window === 'undefined' || window.sessionStorage.getItem('google_just_connected') !== '1') return
    if (hasCheckedDriveAfterConnect.current) return
    hasCheckedDriveAfterConnect.current = true
    window.sessionStorage.removeItem('google_just_connected')
    getSyncMeta()
      .then((meta) => {
        if (!meta?.googleEmail) return
        return downloadFromGDrive()
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
  }, [])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const isDark = theme === 'dark'

  const handleEditProfileOpen = () => {
    setEditNickname(userProfile.nickname)
    setEditEmoji(userProfile.avatarEmoji)
    setEditImage(userProfile.avatarImage)
    setEditingProfile(true)
  }

  const handleSaveProfile = async () => {
    await updateUserProfile({
      nickname: editNickname.trim() || '게스트',
      avatarEmoji: editEmoji,
      avatarImage: editImage,
    })
    setEditingProfile(false)
    showToast('프로필이 저장되었습니다.')
    uploadToGDrive().catch(() => {})
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
    uploadToGDrive().catch(() => {})
  }

  const handleNotifHourChange = (h: number) => {
    setNotifHour(h)
    updateNotificationTime(h, DEFAULT_NOTIFICATION_MINUTE)
    uploadToGDrive().catch(() => {})
  }

  const handleDefaultMaxStagesChange = (val: number) => {
    setDefaultMaxStages(val)
    localStorage.setItem('defaultMaxStages', String(val))
    uploadToGDrive().catch(() => {})
  }

  const handleSoundToggle = () => {
    playToggleSwitch()
    const next = !soundEnabled
    setSoundEnabled(next)
    localStorage.setItem('sound_enabled', String(next))
    uploadToGDrive().catch(() => {})
  }

  const handleDevModeToggle = () => {
    playToggleSwitch()
    const next = !devMode
    setDevMode(next)
    localStorage.setItem('dev_mode', String(next))
    uploadToGDrive().catch(() => {})
  }

  const handleNotificationToggle = async () => {
    playToggleSwitch()
    if (!notifications) {
      const result = await enableNotifications()
      if (result === 'granted') {
        setNotifications(true)
        showToast('알림이 활성화되었습니다. 매일 오전 9시에 알림을 드릴게요!')
        uploadToGDrive().catch(() => {})
      } else if (result === 'denied') {
        showToast('알림 권한이 거부되었습니다. 브라우저 설정에서 허용해 주세요.')
      } else {
        showToast('이 브라우저는 알림을 지원하지 않습니다.')
      }
    } else {
      await disableNotifications()
      setNotifications(false)
      showToast('알림이 비활성화되었습니다.')
      uploadToGDrive().catch(() => {})
    }
  }

  const handleTestNotification = async () => {
    playNotificationChime()
    await sendTestNotification()
    showToast('테스트 알림을 전송했습니다.')
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
    await clearGoogleAuth()
    setClearConfirm(false)
    showToast('모든 데이터가 삭제되었습니다.')
  }

  const handleGoogleSignOut = async () => {
    await clearGoogleAuth()
    showToast('Google 계정 연결이 해제되었습니다.')
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

  const handleRestoreManualBackup = async (fileId: string) => {
    try {
      const backup = await downloadManualBackup(fileId)
      await applyRemoteDataToLocal(backup)
      showToast('백업을 불러왔습니다.')
      setShowBackupListModal(false)
      window.location.reload()
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
      const backup = await downloadSyncFileFromGDrive()
      if (!backup) {
        showToast('Google Drive에 데이터가 없습니다.')
        return
      }
      await applyRemoteDataToLocal(backup)
      const remoteModified = await getSyncFileModifiedTime()
      if (remoteModified) await updateSyncMeta({ lastKnownRemoteModifiedTime: remoteModified })
      showToast('Google Drive 데이터를 불러왔습니다.')
    } catch (e) {
      const msg = e instanceof Error ? e.message : '백업 불러오기 중 오류가 발생했습니다.'
      showToast(msg)
    }
  }

  const isGoogleConnected = !!syncMeta?.googleEmail

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
                    if (t) await updateSyncMeta({ lastKnownRemoteModifiedTime: t })
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
        <div className="flex items-center gap-4 rounded-2xl bg-card p-5 shadow-sm">
          <div className="relative">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 overflow-hidden">
              {userProfile.avatarImage ? (
                <img src={userProfile.avatarImage} alt="프로필 사진" className="h-full w-full object-cover" />
              ) : (
                <span className="text-3xl">{userProfile.avatarEmoji}</span>
              )}
            </div>
            <button
            onClick={() => { playButtonTap(); handleEditProfileOpen() }}
            className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"
              aria-label="프로필 편집"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </div>
          <div className="flex-1">
            <p className="text-base font-bold text-foreground">{userProfile.nickname}</p>
            <p className="text-xs text-muted-foreground">
              {isGoogleConnected ? syncMeta?.googleEmail : 'Google 계정 미연결'}
            </p>
          </div>
          <button
            onClick={() => { playButtonTap(); handleEditProfileOpen() }}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>

        {/* Profile Edit Panel */}
        {editingProfile && (
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

        {/* Cloud Sync */}
        <Section title="클라우드 동기화">
          {isGoogleConnected ? (
            <>
              <Row
                icon={<Cloud className="h-5 w-5" />}
                label="Google Drive 연결됨"
                description={`두 기기에서 동시에 접속할 시 혼선이 발생할 수 있습니다. 마지막 동기화: ${formatSyncTime(syncMeta?.lastSyncedAt)}`}
                right={
                  <span className="flex items-center gap-1 rounded-full bg-success/15 px-2 py-1 text-[10px] font-bold text-success">
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
                Google 계정으로 여러 기기에서 데이터를 동기화하세요.
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

        {/* Display */}
        <Section title="디스플레이">
          {colorTheme === 'carat' ? (
            <Row
              icon={<Sun className="h-5 w-5" />}
              label="라이트 모드"
              description="캐럿 테마는 라이트 모드만 지원됩니다"
              right={<span className="text-xs text-muted-foreground">고정</span>}
            />
          ) : (
            <Row
              icon={isDark ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
              label={isDark ? '다크 모드' : '라이트 모드'}
              description="화면 테마"
              right={<Toggle checked={isDark} onChange={handleThemeToggle} />}
            />
          )}
          <Divider />
          <div className="px-4 py-3">
            <div className="mb-2 flex items-center gap-2">
              <Palette className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">테마 색상</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {COLOR_THEMES.map(theme => (
                <button
                  key={theme.id}
                  onClick={() => {
                    playButtonTap()
                    setColorTheme(theme.id)
                    if (theme.id === 'carat') setTheme('light')
                    uploadToGDrive().catch(() => {})
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
        </Section>

        {/* Notifications */}
        <Section title="알림">
          <Row
            icon={notifications ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
            label="복습 알림"
            description={notifications ? '매일 정해진 시간에 알림' : '복습할 카드가 있을 때 알림'}
            right={<Toggle checked={notifications} onChange={handleNotificationToggle} />}
          />
          <Divider />
          <div className="px-4 py-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">알림 시간</span>
              <span className="text-sm font-bold text-primary">
                {notifHour < 12 ? `오전 ${notifHour}시` : notifHour === 12 ? '오후 12시' : `오후 ${notifHour - 12}시`}
              </span>
            </div>
            {!notifications && (
              <p className="mb-2 rounded-xl bg-muted px-3 py-1.5 text-[11px] text-muted-foreground">
                알림을 켜야 적용됩니다
              </p>
            )}
            <input
              type="range" min={6} max={22} value={notifHour}
              onChange={e => handleNotifHourChange(parseInt(e.target.value, 10))}
              className="w-full accent-primary"
              disabled={!notifications}
            />
            <div className="mt-1 flex gap-1 flex-wrap">
              {[7, 8, 9, 12, 18, 20].map(h => (
                <button
                  key={h}
                  onClick={() => { playButtonTap(); handleNotifHourChange(h) }}
                  disabled={!notifications}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-40 ${
                    notifHour === h ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {h < 12 ? `오전 ${h}시` : h === 12 ? '오후 12시' : `오후 ${h - 12}시`}
                </button>
              ))}
            </div>
          </div>
          {notifications && (
            <>
              <Divider />
              <Row
                icon={<Bell className="h-5 w-5" />}
                label="테스트 알림 보내기"
                description="알림이 동작하는지 확인"
                onClick={() => { playButtonTap(); handleTestNotification() }}
              />
            </>
          )}
        </Section>

        {/* App Settings */}
        <Section title="앱 기본 설정">
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
            <div className="mt-2 flex gap-1 flex-wrap">
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
          </div>
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
            label="사용 가이드"
            description="라이트너 시스템 및 앱 사용법"
            onClick={() => { playButtonTap(); navigate({ type: 'help' }) }}
          />
          <Divider />
          <Row
            icon={<PlayCircle className="h-5 w-5" />}
            label="앱 소개 다시 보기"
            description="처음 실행 시 나타나는 가이드"
            onClick={() => { playButtonTap(); setShowOnboarding(true) }}
          />
          <Divider />
          <Row
            icon={<Info className="h-5 w-5" />}
            label="앱 정보"
            description={`ReVibe v${APP_VERSION} · © hormaind207`}
          />
          <Divider />
          <Row
            icon={<Info className="h-5 w-5" />}
            label="ㄴ섞기"
            description=""
            onClick={() => { playButtonTap(); setShowNmixxEasterEgg(true) }}
          />
        </Section>

        {/* Developer mode — minimalist */}
        <div className="flex items-center justify-between rounded-2xl bg-muted/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-muted-foreground/60" />
            <span className="text-xs font-medium text-muted-foreground/60">개발자 모드</span>
          </div>
          <Toggle checked={devMode} onChange={handleDevModeToggle} />
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

      {showOnboarding && (
        <Onboarding onComplete={() => setShowOnboarding(false)} />
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
