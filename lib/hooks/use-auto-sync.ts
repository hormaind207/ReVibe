'use client'

/**
 * @deprecated Use initDriveSyncEngine from lib/sync/sync-engine in app-shell.
 */
import { initDriveSyncEngine } from '@/lib/sync/sync-engine'

export function useAutoSync() {
  return initDriveSyncEngine()
}
