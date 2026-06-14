'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, Bug, Trash2 } from 'lucide-react'
import { ScreenHeader } from '@/components/screen-header'
import { useDeveloperMode } from '@/lib/hooks/use-developer-mode'
import { deleteBugReportForAdmin, listBugReportsForAdmin, type BugReportRow } from '@/lib/bug-reports'
import { playButtonTap } from '@/lib/sounds'

function formatReportTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function BugReportsAdminScreen() {
  const { enabled: developerMode } = useDeveloperMode()
  const [reports, setReports] = useState<BugReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  const loadReports = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    const rows = await listBugReportsForAdmin()
    setReports(rows)
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    if (!developerMode) return
    loadReports()
  }, [developerMode, loadReports])

  const handleDelete = async (reportId: string) => {
    playButtonTap()
    if (!window.confirm('이 제보를 삭제할까요?')) return
    setDeletingId(reportId)
    const ok = await deleteBugReportForAdmin(reportId)
    setDeletingId(null)
    if (ok) {
      setReports((prev) => prev.filter((r) => r.id !== reportId))
      flash('제보를 삭제했습니다.')
    } else {
      flash('삭제에 실패했습니다.')
    }
  }

  if (!developerMode) {
    return (
      <div className="flex flex-col pb-20">
        <ScreenHeader title="버그 제보" showBack />
        <p className="px-4 py-16 text-center text-sm text-muted-foreground">
          개발자 모드가 꺼져 있습니다.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col pb-20">
      <ScreenHeader title="버그 제보" showBack />

      {toast && (
        <div className="fixed bottom-24 left-4 right-4 z-50 mx-auto max-w-md rounded-2xl bg-foreground px-4 py-3 text-center text-sm font-semibold text-background shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex flex-col gap-4 px-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            최근 제보 {reports.length}건 (최대 200건)
          </p>
          <button
            type="button"
            onClick={() => {
              playButtonTap()
              loadReports(true)
            }}
            disabled={refreshing}
            className="flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-semibold text-muted-foreground disabled:opacity-50"
          >
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            새로고침
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : reports.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">제보된 버그가 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {reports.map((report) => (
              <li key={report.id} className="rounded-2xl bg-card p-4 shadow-sm">
                <div className="mb-2 flex items-start gap-2">
                  <Bug className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground">
                      {report.reporterNickname ?? '익명'}
                      {report.appVersion ? (
                        <span className="ml-1.5 font-normal text-muted-foreground">
                          · v{report.appVersion}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{formatReportTime(report.createdAt)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(report.id)}
                    disabled={deletingId === report.id}
                    className="flex shrink-0 items-center gap-1 rounded-lg bg-destructive/10 px-2 py-1 text-[11px] font-semibold text-destructive disabled:opacity-50"
                  >
                    {deletingId === report.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                    삭제
                  </button>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{report.body}</p>
                {report.userAgent && (
                  <p className="mt-2 truncate text-[10px] text-muted-foreground/70" title={report.userAgent}>
                    {report.userAgent}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
