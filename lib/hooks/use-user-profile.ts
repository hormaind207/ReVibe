'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { DBUserProfile } from '../db'

const DEFAULT_PROFILE: DBUserProfile = {
  id: 'profile',
  nickname: '게스트',
  avatarEmoji: '🧠',
}

export function useUserProfile(): DBUserProfile {
  const profile = useLiveQuery(() => db.userProfile.get('profile'))
  return profile ?? DEFAULT_PROFILE
}

export async function updateUserProfile(data: Partial<Pick<DBUserProfile, 'nickname' | 'avatarEmoji' | 'avatarImage'>>): Promise<void> {
  const existing = await db.userProfile.get('profile')
  if (existing) {
    await db.userProfile.update('profile', data)
  } else {
    await db.userProfile.put({ ...DEFAULT_PROFILE, ...data })
  }
}
