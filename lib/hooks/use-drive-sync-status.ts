'use client'

import { useEffect, useState } from 'react'
import {
  getDriveSyncStatus,
  subscribeDriveSyncStatus,
  type DriveSyncStatus,
} from '@/lib/sync/sync-engine'
import { useSyncMeta, isGoogleTokenValid } from './use-sync-meta'

export function useDriveSyncStatus(): DriveSyncStatus {
  const syncMeta = useSyncMeta()
  const [status, setStatus] = useState<DriveSyncStatus>(getDriveSyncStatus())

  useEffect(() => {
    return subscribeDriveSyncStatus(setStatus)
  }, [])

  useEffect(() => {
    if (!syncMeta?.googleEmail) return
    if (!isGoogleTokenValid(syncMeta)) {
      setStatus('no_token')
      return
    }
    if (syncMeta.hasPendingLocalChanges && status === 'idle') {
      setStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'pending')
    }
  }, [syncMeta, status])

  return status
}

export function driveSyncStatusLabel(status: DriveSyncStatus): string {
  switch (status) {
    case 'synced':
      return '동기화됨'
    case 'syncing':
      return '동기화 중…'
    case 'pending':
      return '변경사항 저장 대기 중'
    case 'offline':
      return '오프라인 — 저장 대기 중'
    case 'error':
      return '동기화 실패 — 다시 시도해 주세요'
    case 'no_token':
      return 'Google 다시 연결 필요'
    default:
      return '동기화 준비됨'
  }
}
