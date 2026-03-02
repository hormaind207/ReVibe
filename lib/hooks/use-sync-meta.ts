'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db, type DBSyncMeta } from '../db'

const META_ID = 'meta'

export function useSyncMeta() {
  return useLiveQuery(() => db.syncMeta.get(META_ID), [], undefined)
}

export async function getSyncMeta(): Promise<DBSyncMeta | undefined> {
  return db.syncMeta.get(META_ID)
}

export async function updateSyncMeta(data: Partial<Omit<DBSyncMeta, 'id'>>): Promise<void> {
  const existing = await db.syncMeta.get(META_ID)
  if (existing) {
    await db.syncMeta.update(META_ID, data)
  } else {
    await db.syncMeta.put({
      id: META_ID,
      lastSyncedAt: null,
      googleEmail: null,
      googleAccessToken: null,
      googleTokenExpiry: null,
      lastKnownRemoteModifiedTime: null,
      ...data,
    })
  }
}

export async function clearGoogleAuth(): Promise<void> {
  await updateSyncMeta({
    googleEmail: null,
    googleAccessToken: null,
    googleTokenExpiry: null,
  })
}
