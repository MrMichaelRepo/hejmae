// Download a vendor product image and store it in our bucket so the
// catalog doesn't break when the vendor moves or delists the product.
// Called from runScrape after metadata extraction. Soft-fails on any
// step — the caller keeps the original URL on failure, so the worst
// case is "we kept the hotlink" instead of "we dropped the image".

import { uploadCatalogImage } from '@/lib/storage'

const MAX_BYTES = 8 * 1024 * 1024 // 8 MB — well above any reasonable product photo
const FETCH_TIMEOUT_MS = 10_000

const USER_AGENT =
  'Mozilla/5.0 (compatible; HejmaeClipper/1.0; +https://hejmae.com/clipper)'

const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif', // animated frames flatten in sharp; we keep first frame
  'image/avif',
])

// Returns the new storage path on success, or null on any soft-failure
// (network, oversize, decode error). Callers should treat null as
// "keep the original URL" — better than no image.
export async function persistCatalogImage(
  imageUrl: string,
  catalogProductId: string,
): Promise<string | null> {
  const fetched = await fetchImageBytes(imageUrl)
  if (!fetched) return null

  try {
    return await uploadCatalogImage(fetched.buffer, fetched.contentType, catalogProductId)
  } catch (err) {
    console.error('[clippings.persistImage] upload failed', { catalogProductId, err })
    return null
  }
}

async function fetchImageBytes(
  url: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS)
  try {
    const r = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: ac.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'image/*',
      },
    })
    if (!r.ok) {
      console.warn('[clippings.persistImage] fetch non-ok', url, r.status)
      return null
    }

    // Trust the response's content-type only as a hint; sharp will
    // refuse anything that isn't a real image regardless.
    const ct = (r.headers.get('content-type') ?? '').toLowerCase().split(';')[0]!.trim()
    if (ct && !ALLOWED_CONTENT_TYPES.has(ct)) {
      console.warn('[clippings.persistImage] unsupported content-type', url, ct)
      return null
    }

    // Honor MAX_BYTES even if the server lies about Content-Length —
    // streaming check stops a 100MB image from blowing memory.
    const declared = Number(r.headers.get('content-length') ?? '0')
    if (declared && declared > MAX_BYTES) {
      console.warn('[clippings.persistImage] too large by header', url, declared)
      return null
    }

    const reader = r.body?.getReader()
    if (!reader) return null

    const chunks: Uint8Array[] = []
    let total = 0
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      total += value.length
    }
    if (total >= MAX_BYTES) {
      console.warn('[clippings.persistImage] truncated at cap', url, total)
      try {
        await reader.cancel()
      } catch {
        // ignore — best-effort
      }
    }

    const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)))
    return { buffer, contentType: ct || 'image/jpeg' }
  } catch (err) {
    console.warn('[clippings.persistImage] fetch failed', url, err)
    return null
  } finally {
    clearTimeout(timer)
  }
}
