'use client'

import { getSupabase, STORAGE_BUCKET } from '@/lib/supabase'

const STORAGE_PUBLIC_PREFIX = '/storage/v1/object/public/'

/** Parse our template-images public URL into a storage object path, or null if external. */
export function parseTemplateImageStoragePath(publicUrl: string): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  if (!base || !publicUrl.startsWith(base)) return null
  const suffix = publicUrl.slice(base.length)
  const prefix = `${STORAGE_PUBLIC_PREFIX}${STORAGE_BUCKET}/`
  if (!suffix.startsWith(prefix)) return null
  const path = suffix.slice(prefix.length)
  return path.length > 0 ? path : null
}

/** Best-effort delete of a template image from Storage (no throw). */
export async function deleteTemplateImageByUrl(url: string | null | undefined): Promise<void> {
  if (!url) return
  const path = parseTemplateImageStoragePath(url)
  if (!path) return
  const sb = getSupabase()
  if (!sb) return
  const { error } = await sb.storage.from(STORAGE_BUCKET).remove([path])
  if (error) console.warn('template image delete failed:', path, error.message)
}

/** Best-effort batch delete (deduped paths). */
export async function deleteTemplateImagesByUrls(urls: Array<string | null | undefined>): Promise<void> {
  const paths = Array.from(
    new Set(
      urls
        .filter((u): u is string => Boolean(u))
        .map(parseTemplateImageStoragePath)
        .filter((p): p is string => Boolean(p))
    )
  )
  if (paths.length === 0) return
  const sb = getSupabase()
  if (!sb) return
  const { error } = await sb.storage.from(STORAGE_BUCKET).remove(paths)
  if (error) console.warn('template images batch delete failed:', error.message)
}

/**
 * Resize/compress an image file client-side before upload (saves storage/bandwidth).
 * Keeps aspect ratio, longest side capped at maxDim, exported as WebP.
 */
export async function resizeImage(file: File, maxDim = 1024, quality = 0.82): Promise<Blob> {
  const dataUrl = await readAsDataUrl(file)
  const img = await loadImage(dataUrl)

  let { width, height } = img
  if (width > maxDim || height > maxDim) {
    if (width >= height) {
      height = Math.round((height / width) * maxDim)
      width = maxDim
    } else {
      width = Math.round((width / height) * maxDim)
      height = maxDim
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context를 가져올 수 없습니다.')
  ctx.drawImage(img, 0, 0, width, height)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/webp', quality)
  )
  if (!blob) throw new Error('이미지 변환에 실패했습니다.')
  return blob
}

/** Resize then upload to the public template-images bucket. Returns the public URL. */
export async function uploadTemplateImage(file: File, uid: string): Promise<string> {
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase가 설정되지 않았습니다.')
  const blob = await resizeImage(file)
  const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`
  const { error } = await sb.storage.from(STORAGE_BUCKET).upload(path, blob, {
    contentType: 'image/webp',
    upsert: false,
  })
  if (error) throw error
  const { data } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
