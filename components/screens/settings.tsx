'use client'

import { useState, useEffect, type CSSProperties } from 'react'
import { useTheme } from 'next-themes'
import { motion } from 'framer-motion'
import { Layers, BookOpen, PlayCircle, Palette, Bell, Code2 } from 'lucide-react'
import { ScreenHeader } from '@/components/screen-header'
import { DEFAULT_MAX_STAGES } from '@/lib/leitner'
import { uploadToGDrive } from '@/lib/sync'
import { useNavigation } from '@/lib/store'
import { Onboarding } from '@/components/onboarding'
import { useColorTheme, COLOR_THEMES } from '@/lib/color-theme'
import {
  getNotificationSettings,
  updateNotificationTime,
  DEFAULT_NOTIFICATION_HOUR,
  DEFAULT_NOTIFICATION_MINUTE,
} from '@/lib/hooks/use-notifications'

export function SettingsScreen() {
  const { navigate } = useNavigation()
  const { theme, setTheme } = useTheme()
  const { colorTheme, setColorTheme } = useColorTheme()
  const [defaultMaxStages, setDefaultMaxStages] = useState(DEFAULT_MAX_STAGES)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [notifEnabled, setNotifEnabled] = useState(false)
  const [notifHour, setNotifHour] = useState(DEFAULT_NOTIFICATION_HOUR)
  const [devMode, setDevMode] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('defaultMaxStages')
    if (saved) setDefaultMaxStages(parseInt(saved, 10))

    const { enabled, hour } = getNotificationSettings()
    setNotifEnabled(enabled)
    setNotifHour(hour)

    setDevMode(localStorage.getItem('dev_mode') === 'true')
  }, [])

  const handleDefaultMaxStagesChange = (val: number) => {
    setDefaultMaxStages(val)
    localStorage.setItem('defaultMaxStages', String(val))
  }

  const handleNotifHourChange = (h: number) => {
    setNotifHour(h)
    updateNotificationTime(h, DEFAULT_NOTIFICATION_MINUTE)
  }

  const handleDevModeToggle = () => {
    const next = !devMode
    setDevMode(next)
    localStorage.setItem('dev_mode', String(next))
  }

  return (
    <div className="flex flex-col pb-20">
      <ScreenHeader title="설정" showBack />

      <motion.div
        className="flex flex-col gap-4 px-4"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Color theme */}
        <div className="rounded-2xl bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
              <Palette className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">테마 색상</p>
              <p className="text-xs text-muted-foreground">앱 전체 색상을 변경합니다</p>
            </div>
          </div>
          <div className="flex gap-3 flex-wrap">
            {COLOR_THEMES.map(theme => (
              <button
                key={theme.id}
                onClick={() => { setColorTheme(theme.id); if (theme.id === 'carat') setTheme('light'); uploadToGDrive().catch(() => {}) }}
                className={`flex flex-col items-center gap-1.5 rounded-xl p-3 transition-all ${
                  colorTheme === theme.id ? 'ring-2 ring-offset-2 bg-primary/10' : 'bg-muted'
                }`}
                style={colorTheme === theme.id ? ({ ringColor: 'gradient' in theme ? theme.gradient[1] : theme.color } as CSSProperties) : {}}
              >
                {'gradient' in theme ? (
                  <div
                    className="h-8 w-8 rounded-full shadow-sm overflow-hidden"
                    style={{
                      background: `linear-gradient(135deg, ${theme.gradient[0]} 0%, ${theme.gradient[0]} 50%, ${theme.gradient[1]} 50%, ${theme.gradient[1]} 100%)`,
                    }}
                  />
                ) : (
                  <div
                    className="h-8 w-8 rounded-full shadow-sm"
                    style={{ backgroundColor: theme.color }}
                  />
                )}
                <span className="text-xs font-semibold text-foreground">{theme.label}</span>
                {colorTheme === theme.id && (
                  <span className="text-[10px] text-primary font-bold">✓ 현재</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Default stages setting */}
        <div className="rounded-2xl bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
              <Layers className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">기본 단계 수</p>
              <p className="text-xs text-muted-foreground">새 카테고리 생성 시 기본값으로 사용됩니다</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={3}
              max={10}
              value={defaultMaxStages}
              onChange={e => handleDefaultMaxStagesChange(parseInt(e.target.value, 10))}
              className="flex-1 accent-primary"
            />
            <span className="w-12 text-center text-base font-bold text-primary">{defaultMaxStages}단계</span>
          </div>
          <div className="mt-3 flex gap-1 flex-wrap">
            {[3, 4, 5, 6, 7, 8, 10].map(n => (
              <button
                key={n}
                onClick={() => handleDefaultMaxStagesChange(n)}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                  defaultMaxStages === n
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-primary/20'
                }`}
              >
                {n}단계
              </button>
            ))}
          </div>
        </div>

        {/* Notification time */}
        <div className="rounded-2xl bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
              <Bell className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">알림 시간</p>
              <p className="text-xs text-muted-foreground">
                {notifEnabled ? '매일 복습 알림을 받을 시간을 설정합니다' : '알림을 켜야 적용됩니다 (프로필 탭에서 켜주세요)'}
              </p>
            </div>
          </div>
          {!notifEnabled && (
            <p className="mb-3 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
              프로필 탭 → 복습 알림을 켜면 아래 시간에 알림을 받을 수 있습니다.
            </p>
          )}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">시간 선택</span>
            <span className="text-base font-bold text-primary">오전/오후 {notifHour}시</span>
          </div>
          <input
            type="range"
            min={6}
            max={22}
            value={notifHour}
            onChange={e => handleNotifHourChange(parseInt(e.target.value, 10))}
            className="w-full accent-primary"
          />
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
            <span>오전 6시</span>
            <span>오후 10시</span>
          </div>
          <div className="mt-3 flex gap-1 flex-wrap">
            {[7, 8, 9, 12, 18, 20].map(h => (
              <button
                key={h}
                onClick={() => handleNotifHourChange(h)}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                  notifHour === h
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-primary/20'
                }`}
              >
                {h < 12 ? `오전 ${h}시` : h === 12 ? '오후 12시' : `오후 ${h - 12}시`}
              </button>
            ))}
          </div>
        </div>

        {/* Help guide shortcut */}
        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          onClick={() => navigate({ type: 'help' })}
          className="flex items-center gap-4 rounded-2xl bg-card px-5 py-4 text-left shadow-sm transition-transform active:scale-[0.98]"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
            <BookOpen className="h-5 w-5 text-primary" />
          </div>
          <div className="flex flex-col flex-1">
            <span className="text-sm font-semibold text-foreground">사용 가이드</span>
            <span className="text-xs text-muted-foreground">ReVibe 상세 사용법 보기</span>
          </div>
        </motion.button>

        {/* Onboarding replay */}
        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onClick={() => setShowOnboarding(true)}
          className="flex items-center gap-4 rounded-2xl bg-card px-5 py-4 text-left shadow-sm transition-transform active:scale-[0.98]"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
            <PlayCircle className="h-5 w-5 text-primary" />
          </div>
          <div className="flex flex-col flex-1">
            <span className="text-sm font-semibold text-foreground">앱 소개 다시 보기</span>
            <span className="text-xs text-muted-foreground">처음 실행 시 나타나는 가이드</span>
          </div>
        </motion.button>

        {/* Developer mode */}
        <div className="rounded-2xl bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
              <Code2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-foreground">개발자 모드</p>
              <p className="text-xs text-muted-foreground">
                {devMode ? '스택 추가 버튼이 표시됩니다' : '테스트용 기능을 활성화합니다'}
              </p>
            </div>
            <button
              onClick={handleDevModeToggle}
              className={`relative h-7 w-12 rounded-full transition-colors duration-200 ${devMode ? 'bg-primary' : 'bg-muted'}`}
            >
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-200 ${devMode ? 'translate-x-5' : 'translate-x-0.5'}`}
              />
            </button>
          </div>
        </div>
      </motion.div>

      {showOnboarding && (
        <Onboarding onComplete={() => setShowOnboarding(false)} />
      )}
    </div>
  )
}
