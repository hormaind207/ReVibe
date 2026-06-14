'use client'

import { getSupabase } from '@/lib/supabase'
import { getDevSessionKey } from '@/lib/config/dev'

export interface HiddenTemplateRow {
  id: string
  ownerId: string
  name: string
  icon: string
  color: string | null
  imageUrl: string | null
  cardCount: number
  likeCount: number
  favoriteCount: number
  reportCount: number
  hidden: boolean
  createdAt: string
  nickname: string
}

interface RawHiddenRow {
  id: string
  owner_id: string
  name: string
  icon: string
  color: string | null
  image_url: string | null
  card_count: number
  like_count: number
  favorite_count: number
  report_count: number
  hidden: boolean
  created_at: string
  nickname: string
}

export async function listHiddenTemplates(devKey: string = getDevSessionKey()): Promise<HiddenTemplateRow[]> {
  const sb = getSupabase()
  if (!sb) return []
  const { data, error } = await sb.rpc('admin_list_hidden_templates', { p_dev_key: devKey })
  if (error) {
    console.error('[moderation] list failed', error.message)
    return []
  }
  return ((data ?? []) as RawHiddenRow[]).map((r) => ({
    id: r.id,
    ownerId: r.owner_id,
    name: r.name,
    icon: r.icon,
    color: r.color,
    imageUrl: r.image_url,
    cardCount: r.card_count,
    likeCount: r.like_count,
    favoriteCount: r.favorite_count,
    reportCount: r.report_count,
    hidden: r.hidden,
    createdAt: r.created_at,
    nickname: r.nickname,
  }))
}

export async function restoreHiddenTemplate(
  templateId: string,
  devKey: string = getDevSessionKey()
): Promise<boolean> {
  const sb = getSupabase()
  if (!sb) return false
  const { error } = await sb.rpc('admin_restore_template', {
    p_dev_key: devKey,
    p_template_id: templateId,
  })
  if (error) {
    console.error('[moderation] restore failed', error.message)
    return false
  }
  return true
}

export async function purgeHiddenTemplate(
  templateId: string,
  devKey: string = getDevSessionKey()
): Promise<boolean> {
  const sb = getSupabase()
  if (!sb) return false
  const { error } = await sb.rpc('admin_purge_template', {
    p_dev_key: devKey,
    p_template_id: templateId,
  })
  if (error) {
    console.error('[moderation] purge failed', error.message)
    return false
  }
  return true
}
