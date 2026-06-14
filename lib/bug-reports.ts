'use client'

import { getDevSessionKey } from '@/lib/config/dev'
import { ensureAnonymousSession } from '@/lib/marketplace/auth'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'

export const BUG_REPORT_MAX_LENGTH = 500

export interface BugReportRow {
  id: string
  body: string
  reporterNickname: string | null
  appVersion: string | null
  userAgent: string | null
  createdAt: string
}

export type SubmitBugReportResult =
  | 'ok'
  | 'rate_limit'
  | 'too_long'
  | 'empty'
  | 'offline'
  | 'error'

function mapRpcError(message: string): SubmitBugReportResult {
  const m = message.toLowerCase()
  if (m.includes('rate_limit')) return 'rate_limit'
  if (m.includes('too_long')) return 'too_long'
  if (m.includes('empty_body')) return 'empty'
  return 'error'
}

export async function submitBugReport(
  body: string,
  meta: { nickname: string; appVersion: string }
): Promise<SubmitBugReportResult> {
  if (!isSupabaseConfigured()) return 'offline'

  const trimmed = body.trim()
  if (!trimmed) return 'empty'
  if (trimmed.length > BUG_REPORT_MAX_LENGTH) return 'too_long'

  const session = await ensureAnonymousSession()
  if (!session) return 'error'

  const sb = getSupabase()
  if (!sb) return 'offline'

  const userAgent =
    typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 512) : null

  const { error } = await sb.rpc('submit_bug_report', {
    p_body: trimmed,
    p_reporter_nickname: meta.nickname || null,
    p_app_version: meta.appVersion || null,
    p_user_agent: userAgent,
  })

  if (error) {
    console.error('[bug-reports] submit failed', error.message)
    return mapRpcError(error.message)
  }

  return 'ok'
}

export async function listBugReportsForAdmin(
  devKey: string = getDevSessionKey()
): Promise<BugReportRow[]> {
  const sb = getSupabase()
  if (!sb || !devKey) return []

  const { data, error } = await sb.rpc('admin_list_bug_reports', { p_dev_key: devKey })
  if (error) {
    console.error('[bug-reports] list failed', error.message)
    return []
  }

  return (
    (data ?? []) as {
      id: string
      body: string
      reporter_nickname: string | null
      app_version: string | null
      user_agent: string | null
      created_at: string
    }[]
  ).map((r) => ({
    id: r.id,
    body: r.body,
    reporterNickname: r.reporter_nickname,
    appVersion: r.app_version,
    userAgent: r.user_agent,
    createdAt: r.created_at,
  }))
}

export async function deleteBugReportForAdmin(
  reportId: string,
  devKey: string = getDevSessionKey()
): Promise<boolean> {
  const sb = getSupabase()
  if (!sb || !devKey) return false

  const { error } = await sb.rpc('admin_delete_bug_report', {
    p_dev_key: devKey,
    p_report_id: reportId,
  })

  if (error) {
    console.error('[bug-reports] delete failed', error.message)
    return false
  }

  return true
}
