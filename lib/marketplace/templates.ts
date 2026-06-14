'use client'

import { getSupabase, MAX_TEMPLATE_CARDS } from '@/lib/supabase'
import { db } from '@/lib/db'
import { normalizeTag } from './hashtags'
import { getDevSessionKey } from '@/lib/config/dev'
import { deleteTemplateImageByUrl } from './images'

export interface TemplateSummary {
  id: string
  ownerId: string
  name: string
  icon: string
  color: string | null
  imageUrl: string | null
  cardCount: number
  likeCount: number
  favoriteCount: number
  createdAt: string
  nickname: string
  liked: boolean
  favorited: boolean
  ownerTrophyCount: number
  isOfficial: boolean
}

export interface TemplateCardRow {
  id: string
  front: string
  back: string
  position: number
}

export interface TemplateDetail extends TemplateSummary {
  cards: TemplateCardRow[]
  hashtags: string[]
  reported: boolean
}

export interface CreateTemplateInput {
  name: string
  icon: string
  color: string | null
  imageUrl: string | null
  hashtags: string[]
}

interface RawTemplate {
  id: string
  owner_id: string
  name: string
  icon: string
  color: string | null
  image_url: string | null
  card_count: number
  like_count: number
  favorite_count: number
  created_at: string
  is_official?: boolean
}

const TEMPLATE_COLS =
  'id, owner_id, name, icon, color, image_url, card_count, like_count, favorite_count, created_at, is_official'

function applyDisplayMeta(s: TemplateSummary, isOfficial: boolean, profileNickname: string): TemplateSummary {
  if (isOfficial) {
    s.isOfficial = true
    s.nickname = 'Admin'
    s.ownerTrophyCount = 0
  } else {
    s.isOfficial = false
    s.nickname = profileNickname
  }
  return s
}

function baseSummary(r: RawTemplate, nickname: string): TemplateSummary {
  const isOfficial = r.is_official === true
  return applyDisplayMeta({
    id: r.id,
    ownerId: r.owner_id,
    name: r.name,
    icon: r.icon,
    color: r.color,
    imageUrl: r.image_url,
    cardCount: r.card_count,
    likeCount: r.like_count,
    favoriteCount: r.favorite_count,
    createdAt: r.created_at,
    nickname,
    liked: false,
    favorited: false,
    ownerTrophyCount: 0,
    isOfficial: isOfficial,
  }, isOfficial, nickname)
}

/** Fetch nicknames + the current user's like/favorite state for a set of templates. */
async function attachMeta(rows: RawTemplate[], uid: string | null): Promise<TemplateSummary[]> {
  const sb = getSupabase()
  if (!sb || rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const ownerIds = Array.from(new Set(rows.map((r) => r.owner_id)))

  const [profilesRes, likesRes, favsRes] = await Promise.all([
    sb.from('profiles').select('id, nickname, trophy_count').in('id', ownerIds),
    uid ? sb.from('template_likes').select('template_id').eq('user_id', uid).in('template_id', ids) : Promise.resolve({ data: [] }),
    uid ? sb.from('template_favorites').select('template_id').eq('user_id', uid).in('template_id', ids) : Promise.resolve({ data: [] }),
  ])

  const nickMap = new Map<string, string>()
  const trophyMap = new Map<string, number>()
  for (const p of (profilesRes.data ?? []) as { id: string; nickname: string; trophy_count?: number }[]) {
    nickMap.set(p.id, p.nickname)
    trophyMap.set(p.id, p.trophy_count ?? 0)
  }
  const likedSet = new Set((likesRes.data ?? []).map((l: { template_id: string }) => l.template_id))
  const favSet = new Set((favsRes.data ?? []).map((f: { template_id: string }) => f.template_id))

  return rows.map((r) => {
    const isOfficial = r.is_official === true
    const profileNick = nickMap.get(r.owner_id) ?? '익명'
    const s = baseSummary(r, profileNick)
    s.liked = likedSet.has(r.id)
    s.favorited = favSet.has(r.id)
    if (!isOfficial) {
      s.ownerTrophyCount = trophyMap.get(r.owner_id) ?? 0
    }
    return s
  })
}

/** Newest visible templates. */
export async function listTemplates(uid: string | null, limit = 60): Promise<TemplateSummary[]> {
  const sb = getSupabase()
  if (!sb) return []
  const { data } = await sb
    .from('templates')
    .select(TEMPLATE_COLS)
    .eq('hidden', false)
    .order('created_at', { ascending: false })
    .limit(limit)
  return attachMeta((data ?? []) as RawTemplate[], uid)
}

/** Most-liked visible templates. */
export async function getPopularTemplates(uid: string | null, limit = 12): Promise<TemplateSummary[]> {
  const sb = getSupabase()
  if (!sb) return []
  const { data } = await sb
    .from('templates')
    .select(TEMPLATE_COLS)
    .eq('hidden', false)
    .gt('like_count', 0)
    .order('like_count', { ascending: false })
    .limit(limit)
  return attachMeta((data ?? []) as RawTemplate[], uid)
}

/** The current user's favorited templates. */
export async function getMyFavorites(uid: string | null, limit = 60): Promise<TemplateSummary[]> {
  const sb = getSupabase()
  if (!sb || !uid) return []
  const { data: favs } = await sb.from('template_favorites').select('template_id').eq('user_id', uid)
  const ids = (favs ?? []).map((f: { template_id: string }) => f.template_id)
  if (ids.length === 0) return []
  const { data } = await sb.from('templates').select(TEMPLATE_COLS).in('id', ids).eq('hidden', false).limit(limit)
  return attachMeta((data ?? []) as RawTemplate[], uid)
}

/** Official (Admin) templates visible on marketplace. */
export async function getOfficialTemplates(uid: string | null, limit = 12): Promise<TemplateSummary[]> {
  const sb = getSupabase()
  if (!sb) return []
  const { data } = await sb
    .from('templates')
    .select(TEMPLATE_COLS)
    .eq('is_official', true)
    .eq('hidden', false)
    .order('created_at', { ascending: false })
    .limit(limit)
  return attachMeta((data ?? []) as RawTemplate[], uid)
}

/** Templates owned by the current user. */
export async function getMyTemplates(
  uid: string | null,
  opts?: { officialOnly?: boolean }
): Promise<TemplateSummary[]> {
  const sb = getSupabase()
  if (!sb || !uid) return []
  let q = sb
    .from('templates')
    .select(TEMPLATE_COLS)
    .eq('owner_id', uid)
  if (opts?.officialOnly === true) {
    q = q.eq('is_official', true)
  } else if (opts?.officialOnly === false) {
    q = q.eq('is_official', false)
  }
  const { data } = await q.order('created_at', { ascending: false })
  return attachMeta((data ?? []) as RawTemplate[], uid)
}

/** Public templates created by a specific owner. */
export async function getTemplatesByOwner(ownerId: string, uid: string | null, limit = 60): Promise<TemplateSummary[]> {
  const sb = getSupabase()
  if (!sb) return []
  const { data } = await sb
    .from('templates')
    .select(TEMPLATE_COLS)
    .eq('owner_id', ownerId)
    .eq('hidden', false)
    .order('created_at', { ascending: false })
    .limit(limit)
  return attachMeta((data ?? []) as RawTemplate[], uid)
}

/** Templates for a given hashtag. */
export async function getTemplatesByHashtag(tag: string, uid: string | null, limit = 20): Promise<TemplateSummary[]> {
  const sb = getSupabase()
  if (!sb) return []
  const { data: tagRows } = await sb.from('template_hashtags').select('template_id').eq('tag', normalizeTag(tag)).limit(limit)
  const ids = (tagRows ?? []).map((t: { template_id: string }) => t.template_id)
  if (ids.length === 0) return []
  const { data } = await sb.from('templates').select(TEMPLATE_COLS).in('id', ids).eq('hidden', false)
  return attachMeta((data ?? []) as RawTemplate[], uid)
}

/** Search by name, publisher nickname, or hashtag. */
export async function searchTemplates(query: string, uid: string | null): Promise<TemplateSummary[]> {
  const sb = getSupabase()
  const q = query.trim()
  if (!sb || !q) return []

  const idSet = new Set<string>()

  // by name
  const byName = await sb.from('templates').select(TEMPLATE_COLS).eq('hidden', false).ilike('name', `%${q}%`).limit(40)
  const rows: RawTemplate[] = []
  for (const r of (byName.data ?? []) as RawTemplate[]) {
    if (!idSet.has(r.id)) { idSet.add(r.id); rows.push(r) }
  }

  // by hashtag
  const byTag = await sb.from('template_hashtags').select('template_id').ilike('tag', `%${normalizeTag(q)}%`).limit(40)
  const tagIds = (byTag.data ?? []).map((t: { template_id: string }) => t.template_id).filter((id: string) => !idSet.has(id))

  // by nickname
  const byNick = await sb.from('profiles').select('id').ilike('nickname', `%${q}%`).limit(40)
  const ownerIds = (byNick.data ?? []).map((p: { id: string }) => p.id)
  let nickIds: string[] = []
  if (ownerIds.length > 0) {
    const r = await sb.from('templates').select('id').eq('hidden', false).in('owner_id', ownerIds).limit(40)
    nickIds = (r.data ?? []).map((t: { id: string }) => t.id).filter((id: string) => !idSet.has(id))
  }

  const extraIds = Array.from(new Set([...tagIds, ...nickIds]))
  if (extraIds.length > 0) {
    const { data } = await sb.from('templates').select(TEMPLATE_COLS).in('id', extraIds).eq('hidden', false)
    for (const r of (data ?? []) as RawTemplate[]) {
      if (!idSet.has(r.id)) { idSet.add(r.id); rows.push(r) }
    }
  }

  return attachMeta(rows, uid)
}

/** Full detail with cards + hashtags + my report state. */
export async function getTemplateDetail(id: string, uid: string | null): Promise<TemplateDetail | null> {
  const sb = getSupabase()
  if (!sb) return null
  const { data: t } = await sb.from('templates').select(TEMPLATE_COLS).eq('id', id).maybeSingle()
  if (!t) return null

  const [summaries, cardsRes, tagsRes, reportRes] = await Promise.all([
    attachMeta([t as RawTemplate], uid),
    sb.from('template_cards').select('id, front, back, position').eq('template_id', id).order('position', { ascending: true }),
    sb.from('template_hashtags').select('tag').eq('template_id', id),
    uid ? sb.from('template_reports').select('template_id').eq('template_id', id).eq('user_id', uid).maybeSingle() : Promise.resolve({ data: null }),
  ])

  const summary = summaries[0]
  if (!summary) return null

  return {
    ...summary,
    cards: (cardsRes.data ?? []) as TemplateCardRow[],
    hashtags: ((tagsRes.data ?? []) as { tag: string }[]).map((r) => r.tag),
    reported: Boolean(reportRes.data),
  }
}

/** Create a new personal template (not official). Returns the new id. */
export async function createTemplate(input: CreateTemplateInput, uid: string): Promise<string> {
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase가 설정되지 않았습니다.')
  const { data, error } = await sb
    .from('templates')
    .insert({
      owner_id: uid,
      name: input.name.trim(),
      icon: input.icon,
      color: input.imageUrl ? null : input.color,
      image_url: input.imageUrl,
      is_official: false,
    })
    .select('id')
    .single()
  if (error || !data) throw error ?? new Error('템플릿 생성 실패')
  const templateId = data.id as string
  await setTemplateHashtags(templateId, input.hashtags)
  return templateId
}

/** Create an official template via dev RPC (Admin persona). */
export async function createOfficialTemplate(input: CreateTemplateInput): Promise<string> {
  const sb = getSupabase()
  const devKey = getDevSessionKey()
  if (!sb || !devKey) throw new Error('개발자 모드를 다시 활성화해 주세요.')
  const { data, error } = await sb.rpc('dev_create_official_template', {
    p_dev_key: devKey,
    p_name: input.name.trim(),
    p_icon: input.icon,
    p_color: input.imageUrl ? null : input.color,
    p_image_url: input.imageUrl,
  })
  if (error || !data) throw error ?? new Error('공식 템플릿 생성 실패')
  const templateId = data as string
  await setTemplateHashtags(templateId, input.hashtags)
  return templateId
}

export async function updateTemplate(
  id: string,
  patch: { name?: string; icon?: string; color?: string | null; imageUrl?: string | null }
): Promise<void> {
  const sb = getSupabase()
  if (!sb) return
  let previousImageUrl: string | null = null
  if (patch.imageUrl !== undefined) {
    const { data } = await sb.from('templates').select('image_url').eq('id', id).maybeSingle()
    previousImageUrl = (data?.image_url as string | null) ?? null
  }
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) row.name = patch.name.trim()
  if (patch.icon !== undefined) row.icon = patch.icon
  if (patch.color !== undefined) row.color = patch.color
  if (patch.imageUrl !== undefined) {
    row.image_url = patch.imageUrl
    if (patch.imageUrl) row.color = null
  }
  const { error } = await sb.from('templates').update(row).eq('id', id)
  if (error) throw error
  if (
    patch.imageUrl !== undefined &&
    previousImageUrl &&
    previousImageUrl !== patch.imageUrl
  ) {
    await deleteTemplateImageByUrl(previousImageUrl)
  }
}

export async function deleteTemplate(id: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) return
  const { data } = await sb.from('templates').select('image_url').eq('id', id).maybeSingle()
  const imageUrl = (data?.image_url as string | null) ?? null
  const { error } = await sb.from('templates').delete().eq('id', id)
  if (error) throw error
  await deleteTemplateImageByUrl(imageUrl)
}

/** Replace the hashtag set for a template. */
export async function setTemplateHashtags(templateId: string, rawTags: string[]): Promise<void> {
  const sb = getSupabase()
  if (!sb) return
  const tags = Array.from(new Set(rawTags.map(normalizeTag).filter(Boolean))).slice(0, 10)
  await sb.from('template_hashtags').delete().eq('template_id', templateId)
  if (tags.length > 0) {
    await sb.from('template_hashtags').insert(tags.map((tag) => ({ template_id: templateId, tag })))
  }
}

/** Add cards to a template (respects the 1000-card cap). */
export async function addCardsToTemplate(
  templateId: string,
  entries: Array<{ front: string; back: string }>
): Promise<number> {
  const sb = getSupabase()
  if (!sb) return 0
  const { count } = await sb
    .from('template_cards')
    .select('id', { count: 'exact', head: true })
    .eq('template_id', templateId)
  const existing = count ?? 0
  const room = MAX_TEMPLATE_CARDS - existing
  if (room <= 0) return 0

  const clean = entries
    .map((e) => ({ front: e.front.trim(), back: e.back.trim() }))
    .filter((e) => e.front && e.back)
    .slice(0, room)
  if (clean.length === 0) return 0

  const rows = clean.map((e, i) => ({
    template_id: templateId,
    front: e.front,
    back: e.back,
    position: existing + i,
  }))
  const { error } = await sb.from('template_cards').insert(rows)
  if (error) throw error
  return clean.length
}

export async function getTemplateCards(templateId: string): Promise<TemplateCardRow[]> {
  const sb = getSupabase()
  if (!sb) return []
  const { data } = await sb
    .from('template_cards')
    .select('id, front, back, position')
    .eq('template_id', templateId)
    .order('position', { ascending: true })
  return (data ?? []) as TemplateCardRow[]
}

export async function deleteTemplateCard(cardId: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) return
  await sb.from('template_cards').delete().eq('id', cardId)
}

export async function updateTemplateCard(
  cardId: string,
  patch: { front: string; back: string }
): Promise<void> {
  const sb = getSupabase()
  if (!sb) return
  const front = patch.front.trim()
  const back = patch.back.trim()
  if (!front || !back) throw new Error('앞면과 뒷면을 모두 입력해 주세요.')
  const { error } = await sb.from('template_cards').update({ front, back }).eq('id', cardId)
  if (error) throw error
}

/** Import all cards from a local category into a template (whole-category only). */
export async function importLocalCategoryToTemplate(templateId: string, categoryId: string): Promise<number> {
  const cards = await db.cards.where('categoryId').equals(categoryId).sortBy('createdAt')
  const entries = cards.map((c) => ({ front: c.front, back: c.back }))
  return addCardsToTemplate(templateId, entries)
}
