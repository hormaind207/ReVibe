import Dexie, { type EntityTable } from 'dexie'

export interface DBCategory {
  id: string
  name: string
  icon: string
  color: string
  maxStages?: number // defaults to 7 if undefined
  stageIntervals?: Record<number, number> // custom interval days per stage
  stageLabels?: Record<number, string>   // custom label names per stage
  createdAt: number
  updatedAt: number
}

export interface DBStack {
  id: string
  categoryId: string
  stage: number // 1-7
  nextReviewDate: string // YYYY-MM-DD (may be bumped to today for overdue handling)
  scheduledReviewDate?: string // original scheduled date — never changed after creation; used for display
  isCompleted: boolean
  name?: string // optional display name; if unset, UI uses date-based label
  createdAt: number
  updatedAt: number
}

export interface DBCard {
  id: string
  stackId: string
  categoryId: string
  front: string
  back: string
  lastReviewed: number | null
  createdAt: number
  updatedAt: number
}

export interface DBSyncMeta {
  id: string // always 'meta'
  lastSyncedAt: number | null
  googleEmail: string | null
  googleAccessToken: string | null
  googleTokenExpiry: number | null
  /** Drive API modifiedTime (RFC 3339) of revibe-data.json for pull detection */
  lastKnownRemoteModifiedTime: string | null
}

export interface DBUserProfile {
  id: string // always 'profile'
  nickname: string
  avatarEmoji: string
  avatarImage?: string // base64 Data URL of uploaded photo
}

export interface DBStreakMeta {
  id: string // always 'meta'
  currentStreak: number
  lastSuccessDate: string | null // YYYY-MM-DD
}

class VibeLeitnerDB extends Dexie {
  categories!: EntityTable<DBCategory, 'id'>
  stacks!: EntityTable<DBStack, 'id'>
  cards!: EntityTable<DBCard, 'id'>
  syncMeta!: EntityTable<DBSyncMeta, 'id'>
  userProfile!: EntityTable<DBUserProfile, 'id'>
  streakMeta!: EntityTable<DBStreakMeta, 'id'>

  constructor() {
    super('VibeLeitnerDB')

    // Version 1: original schema (without compound index)
    this.version(1).stores({
      categories: 'id, name, createdAt',
      stacks: 'id, categoryId, stage, nextReviewDate, isCompleted, createdAt',
      cards: 'id, stackId, categoryId, createdAt',
      syncMeta: 'id',
    })

    // Version 2: add [categoryId+stage] compound index for efficient stage queries
    this.version(2).stores({
      categories: 'id, name, createdAt',
      stacks: 'id, categoryId, stage, nextReviewDate, isCompleted, createdAt, [categoryId+stage]',
      cards: 'id, stackId, categoryId, createdAt',
      syncMeta: 'id',
    })

    // Version 3: add userProfile table
    this.version(3).stores({
      categories: 'id, name, createdAt',
      stacks: 'id, categoryId, stage, nextReviewDate, isCompleted, createdAt, [categoryId+stage]',
      cards: 'id, stackId, categoryId, createdAt',
      syncMeta: 'id',
      userProfile: 'id',
    })

    // Version 4: DBSyncMeta.lastKnownRemoteModifiedTime (no store change; field only)
    this.version(4).stores({
      categories: 'id, name, createdAt',
      stacks: 'id, categoryId, stage, nextReviewDate, isCompleted, createdAt, [categoryId+stage]',
      cards: 'id, stackId, categoryId, createdAt',
      syncMeta: 'id',
      userProfile: 'id',
    })

    // Version 5: streakMeta for review streak
    this.version(5).stores({
      categories: 'id, name, createdAt',
      stacks: 'id, categoryId, stage, nextReviewDate, isCompleted, createdAt, [categoryId+stage]',
      cards: 'id, stackId, categoryId, createdAt',
      syncMeta: 'id',
      userProfile: 'id',
      streakMeta: 'id',
    })
  }
}

export const db = new VibeLeitnerDB()

export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}
