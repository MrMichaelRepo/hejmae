// POST /api/catalog/search/image — AI image search over the master catalog.
//
// Two input flavors:
//   * multipart/form-data with field `image` (designer's file picker)
//   * JSON { image_url } (designer pasted a URL into the modal)
//
// Pipeline:
//   1. Validate mime + size (≤ 5 MB; jpeg/png/webp only).
//   2. GPT-4o vision → text description tuned for product search.
//   3. text-embedding-3-small → 1536-dim vector.
//   4. match_catalog_products() RPC for cosine ANN, filtered by
//      similarity ≥ 0.65, top 24.
//   5. Sign image URLs and return.
//
// Costs ~ $0.01–0.02 per call (mostly the vision call), so the route is
// rate-limited via the dedicated `imageSearch` bucket (30/min/designer).

import { NextResponse, type NextRequest } from 'next/server'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import {
  withErrorHandling,
  badRequest,
  tooManyRequests,
  serverError,
} from '@/lib/errors'
import { checkRateLimit } from '@/lib/ratelimit'
import { withSignedUrlsList } from '@/lib/storage'
import {
  describeImageForSearch,
  embedText,
  isOpenAIConfigured,
} from '@/lib/ai/openai'
import { imageSearchUrlInput } from '@/lib/validations/catalog'
import type { CatalogProductSearchHit } from '@/lib/supabase/types'

const MAX_BYTES = 5 * 1024 * 1024
const SIMILARITY_THRESHOLD = 0.65
const MATCH_LIMIT = 24
type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp'
const ALLOWED_MIME: ReadonlySet<ImageMime> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()

    if (!isOpenAIConfigured()) {
      throw serverError('Image search is not configured on this deployment', {
        hint: 'OPENAI_API_KEY',
      })
    }

    const rl = await checkRateLimit('imageSearch', ctx.designerId)
    if (!rl.ok) throw tooManyRequests('Too many image searches — try again in a minute')

    const { bytes, mime } = await readImageFromRequest(req)

    const base64 = bytes.toString('base64')
    const queryDescription = await describeImageForSearch(base64, mime)
    const queryEmbedding = await embedText(queryDescription)

    const { data: matches, error } = await supabaseAdmin().rpc(
      'match_catalog_products',
      {
        query_embedding: JSON.stringify(queryEmbedding) as unknown as string,
        match_threshold: SIMILARITY_THRESHOLD,
        match_count: MATCH_LIMIT,
      },
    )
    if (error) throw error

    const signed = await withSignedUrlsList(
      (matches ?? []) as CatalogProductSearchHit[],
      'image_url',
    )

    return NextResponse.json({
      data: {
        results: signed,
        query_description: queryDescription,
      },
      error: null,
    })
  })
}

// --- input parsing ----------------------------------------------------------

async function readImageFromRequest(
  req: NextRequest,
): Promise<{ bytes: Buffer; mime: ImageMime }> {
  const contentType = (req.headers.get('content-type') ?? '').toLowerCase()
  if (contentType.startsWith('multipart/form-data')) {
    return readMultipart(req)
  }
  if (contentType.startsWith('application/json')) {
    return readJsonUrl(req)
  }
  throw badRequest(
    'Unsupported content-type — send multipart/form-data with field "image" or JSON { image_url }',
  )
}

async function readMultipart(
  req: NextRequest,
): Promise<{ bytes: Buffer; mime: ImageMime }> {
  const form = await req.formData()
  const file = form.get('image')
  if (!(file instanceof File)) throw badRequest('Missing field "image"')
  if (file.size > MAX_BYTES) {
    throw badRequest(
      `Image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB, max 5 MB)`,
    )
  }
  const mime = normalizeMime(file.type)
  const buf = Buffer.from(await file.arrayBuffer())
  return { bytes: buf, mime }
}

async function readJsonUrl(
  req: NextRequest,
): Promise<{ bytes: Buffer; mime: ImageMime }> {
  const { image_url } = imageSearchUrlInput.parse(await req.json())
  return fetchExternalImage(image_url)
}

async function fetchExternalImage(
  raw: string,
): Promise<{ bytes: Buffer; mime: ImageMime }> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw badRequest('Invalid image URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw badRequest('Image URL must be http(s)')
  }
  await assertPublicHost(url.hostname)

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 10_000)
  let res: Response
  try {
    res = await fetch(url.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: ac.signal,
      headers: { Accept: 'image/*' },
    })
  } catch {
    clearTimeout(timer)
    throw badRequest('Could not fetch image at that URL')
  }
  clearTimeout(timer)
  if (!res.ok) {
    throw badRequest(`Could not fetch image (HTTP ${res.status})`)
  }

  // Streaming size cap. Some servers omit Content-Length, so trust nothing
  // and stop reading once we hit MAX_BYTES.
  const reader = res.body?.getReader()
  if (!reader) throw badRequest('Empty response from image URL')
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      total += value.byteLength
      if (total > MAX_BYTES) {
        try {
          await reader.cancel()
        } catch {
          /* best-effort */
        }
        throw badRequest('Image at that URL is too large (max 5 MB)')
      }
      chunks.push(value)
    }
  }
  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)))
  const mime = normalizeMime(res.headers.get('content-type') ?? '')
  return { bytes: buf, mime }
}

// Block obvious SSRF targets. Resolves the hostname and rejects loopback,
// link-local, and RFC1918 ranges (v4 + v6 equivalents). Not bulletproof —
// a determined attacker can still play DNS games — but covers the common
// "paste http://localhost/admin" footgun on an auth-gated route.
async function assertPublicHost(hostname: string): Promise<void> {
  const lower = hostname.toLowerCase()
  if (
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.internal') ||
    lower.endsWith('.local')
  ) {
    throw badRequest('Image URL points to a private host')
  }

  // Resolve to an IP (or treat the host as an IP literal already).
  let ip: string
  if (isIP(hostname)) {
    ip = hostname
  } else {
    try {
      const r = await lookup(hostname)
      ip = r.address
    } catch {
      throw badRequest('Could not resolve image host')
    }
  }

  if (isPrivateIp(ip)) {
    throw badRequest('Image URL points to a private network')
  }
}

function isPrivateIp(ip: string): boolean {
  const v = isIP(ip)
  if (v === 4) {
    const parts = ip.split('.').map((n) => Number(n))
    const [a, b] = parts as [number, number, number, number]
    if (a === 10) return true
    if (a === 127) return true
    if (a === 0) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    return false
  }
  if (v === 6) {
    const lower = ip.toLowerCase()
    if (lower === '::1' || lower === '::') return true
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true // ULA
    if (lower.startsWith('fe80')) return true // link-local
    return false
  }
  return false
}

function normalizeMime(raw: string): ImageMime {
  const mime = raw.split(';')[0]!.trim().toLowerCase()
  if (!ALLOWED_MIME.has(mime as ImageMime)) {
    throw badRequest(
      `Unsupported image type: ${mime || 'unknown'} (jpeg, png, webp only)`,
    )
  }
  return mime as ImageMime
}
