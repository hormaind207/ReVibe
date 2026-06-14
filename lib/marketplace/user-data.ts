'use client'

import { getSupabase } from '@/lib/supabase'
import { deleteTemplateImagesByUrls } from './images'

/** Delete marketplace templates, reactions, and ranking data for the current user. */
export async function deleteUserCloudData(): Promise<boolean> {
  const sb = getSupabase()
  if (!sb) return false
  const { data: { user } } = await sb.auth.getUser()
  if (!user || user.is_anonymous) return true

  const { data: templates } = await sb
    .from('templates')
    .select('image_url')
    .eq('owner_id', user.id)
  const imageUrls = (templates ?? []).map((t) => t.image_url as string | null)

  const { error } = await sb.rpc('delete_user_cloud_data')
  if (error) return false

  await deleteTemplateImagesByUrls(imageUrls)
  return true
}
