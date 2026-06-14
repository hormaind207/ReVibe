import { NextRequest, NextResponse } from 'next/server'

const ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY ?? ''

interface UnsplashPhoto {
  id: string
  urls: { small: string; regular: string; raw: string }
  alt_description: string | null
  user: { name: string; links: { html: string } }
  links: { download_location: string }
  width: number
  height: number
}

export async function GET(req: NextRequest) {
  if (!ACCESS_KEY) {
    return NextResponse.json({ error: 'Unsplash API key not configured' }, { status: 503 })
  }

  // Unsplash requires triggering the download endpoint on selection.
  // Restrict to Unsplash's own API host to prevent SSRF / access-key leakage.
  const dl = req.nextUrl.searchParams.get('dl')
  if (dl) {
    let parsed: URL | null = null
    try {
      parsed = new URL(dl)
    } catch {
      parsed = null
    }
    if (!parsed || parsed.protocol !== 'https:' || parsed.hostname !== 'api.unsplash.com') {
      return NextResponse.json({ error: 'Invalid download location' }, { status: 400 })
    }
    try {
      await fetch(parsed.toString(), { headers: { Authorization: `Client-ID ${ACCESS_KEY}` } })
    } catch { /* best-effort */ }
    return NextResponse.json({ ok: true })
  }

  const rawQ = req.nextUrl.searchParams.get('q') ?? ''
  const q = rawQ.slice(0, 100)
  const rawPage = parseInt(req.nextUrl.searchParams.get('page') ?? '1', 10)
  const page = String(Math.min(Math.max(1, isNaN(rawPage) ? 1 : rawPage), 20))

  const url = new URL('https://api.unsplash.com/search/photos')
  url.searchParams.set('query', q || 'study')
  url.searchParams.set('page', page)
  url.searchParams.set('per_page', '20')
  url.searchParams.set('orientation', 'landscape')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Client-ID ${ACCESS_KEY}` },
    next: { revalidate: 60 },
  })

  if (!res.ok) {
    return NextResponse.json({ error: 'Unsplash API error' }, { status: res.status })
  }

  const data = await res.json()
  const results = (data.results as UnsplashPhoto[]).map((p) => ({
    id: p.id,
    thumb: p.urls.small,
    regular: p.urls.regular,
    raw: p.urls.raw,
    alt: p.alt_description ?? '',
    author: p.user.name,
    authorUrl: p.user.links.html,
    downloadLocation: p.links.download_location,
  }))

  return NextResponse.json({ results, total: data.total })
}
