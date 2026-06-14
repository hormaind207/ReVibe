'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, Eye, Trash2, AlertTriangle } from 'lucide-react'
import { ScreenHeader } from '@/components/screen-header'
import { useDeveloperMode } from '@/lib/hooks/use-developer-mode'
import {
  listHiddenTemplates,
  restoreHiddenTemplate,
  purgeHiddenTemplate,
  type HiddenTemplateRow,
} from '@/lib/marketplace/moderation'
import { playButtonTap } from '@/lib/sounds'

export function MarketplaceModerationScreen() {
  const { enabled: developerMode } = useDeveloperMode()
  const [templates, setTemplates] = useState<HiddenTemplateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmPurgeId, setConfirmPurgeId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  const reload = useCallback(async () => {
    setLoading(true)
    const rows = await listHiddenTemplates()
    setTemplates(rows)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!developerMode) return
    reload()
  }, [developerMode, reload])

  if (!developerMode) {
    return (
      <div className="flex flex-col pb-20">
        <ScreenHeader title="숨김 템플릿 검토" showBack />
        <p className="px-4 py-16 text-center text-sm text-muted-foreground">
          개발자 모드가 꺼져 있습니다. 프로필에서 개발자 모드를 켜 주세요.
        </p>
      </div>
    )
  }

  const handleRestore = async (id: string) => {
    playButtonTap()
    setBusyId(id)
    const ok = await restoreHiddenTemplate(id)
    setBusyId(null)
    if (ok) {
      flash('템플릿을 다시 공개했습니다.')
      reload()
    } else {
      flash('복구에 실패했습니다.')
    }
  }

  const handlePurge = async (id: string) => {
    playButtonTap()
    setBusyId(id)
    const ok = await purgeHiddenTemplate(id)
    setBusyId(null)
    setConfirmPurgeId(null)
    if (ok) {
      flash('템플릿을 완전히 삭제했습니다.')
      reload()
    } else {
      flash('삭제에 실패했습니다.')
    }
  }

  return (
    <div className="flex flex-col pb-20">
      <ScreenHeader title="숨김 템플릿 검토" showBack />

      <div className="flex flex-col gap-3 px-4">
        <p className="text-xs text-muted-foreground">
          신고 누적으로 숨겨진 템플릿입니다. 다시 공개하거나 DB에서 완전히 삭제할 수 있습니다.
        </p>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            불러오는 중...
          </div>
        ) : templates.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">숨김 처리된 템플릿이 없습니다.</p>
        ) : (
          templates.map((t) => (
            <div
              key={t.id}
              className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-sm"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-foreground">{t.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t.nickname} · 카드 {t.cardCount}장 · 신고 {t.reportCount}회
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleRestore(t.id)}
                  disabled={busyId === t.id}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
                >
                  <Eye className="h-3.5 w-3.5" />
                  다시 공개
                </button>
                <button
                  onClick={() => { playButtonTap(); setConfirmPurgeId(t.id) }}
                  disabled={busyId === t.id}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-destructive/15 py-2.5 text-xs font-bold text-destructive disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  완전 삭제
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {confirmPurgeId && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setConfirmPurgeId(null)}
        >
          <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <p className="text-base font-bold">완전 삭제</p>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              이 템플릿과 모든 카드·해시태그·신고 기록이 DB에서 영구 삭제됩니다. 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handlePurge(confirmPurgeId)}
                className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-bold text-white"
              >
                삭제
              </button>
              <button
                onClick={() => { playButtonTap(); setConfirmPurgeId(null) }}
                className="flex-1 rounded-xl bg-muted py-2.5 text-sm font-medium text-foreground"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed left-4 right-4 top-4 z-[80] mx-auto max-w-md rounded-xl bg-primary px-4 py-3 text-center text-sm font-medium text-primary-foreground shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
