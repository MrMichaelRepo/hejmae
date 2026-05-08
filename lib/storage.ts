// Supabase Storage helpers. All uploads go through the server using the
// secret key (service role), so we don't need per-object RLS — the API
// route enforces ownership before calling these.
//
// The `hejmae` bucket is PRIVATE: assets are reachable only via signed URLs
// minted server-side at the moment of use. DB columns store the storage
// path (e.g. `floor-plan/<designer>/<project>/<uuid>.webp`); pass them
// through resolveAssetUrl() before sending to a client.
//
// Floor plans get a multi-stage processing pipeline before they hit
// storage:
//   1. PDFs are rasterized to PNG (page 1).
//   2. Tier-1: EXIF auto-orient, max-width resize, WebP encode, strip
//      metadata.
//   3. Tier-3 (best-effort): a Claude vision call locates the floor plan
//      in the frame, then we rotate-and-crop to that quad. Soft-fails
//      back to the tier-1 buffer if the API is unavailable or unsure.
// Item images get tiers 1 only (no PDF, no AI).

import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase/server'
import { normalizeImage } from '@/lib/image/normalize'
import { rasterizePdfFirstPage } from '@/lib/image/pdf'
import { straightenFloorPlan } from '@/lib/image/straighten'
import { postprocessFloorPlan } from '@/lib/image/postprocess'
import { extractBucketPath } from '@/lib/storage-utils'
export { normalizeStoredAsset } from '@/lib/storage-utils'

export const STORAGE_BUCKET = 'hejmae'

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
])

const ALLOWED_DOC_TYPES = new Set([
  ...ALLOWED_IMAGE_TYPES,
  'application/pdf',
])

const MAX_BYTES = 25 * 1024 * 1024 // 25 MB

export type UploadKind = 'floor-plan' | 'item-image' | 'doc' | 'receipt'

const ALLOWED_BY_KIND: Record<UploadKind, Set<string>> = {
  'floor-plan': ALLOWED_DOC_TYPES,
  'item-image': ALLOWED_IMAGE_TYPES,
  doc: ALLOWED_DOC_TYPES,
  receipt: ALLOWED_DOC_TYPES,
}

export interface UploadInput {
  kind: UploadKind
  designerId: string
  // Project is optional for studio-level uploads (e.g. receipts not tied
  // to a specific project). Path slot becomes "_" so the layout stays
  // predictable: kind/designerId/projectId/ownerId/uuid.ext
  projectId?: string
  file: File
  // Optional sub-key (e.g. itemId or expenseId) for nested grouping.
  ownerId?: string
}

export interface UploadResult {
  path: string
  // Short-lived signed URL for immediate display after upload. Don't
  // persist this — it expires. Persist `path` and resolve at read time.
  signedUrl: string
  contentType: string
  size: number
  // True when AI auto-straighten ran and produced a usable result. Only
  // ever set on floor-plan uploads.
  straightened?: boolean
}

export async function uploadAsset(input: UploadInput): Promise<UploadResult> {
  const { file } = input
  const allowed = ALLOWED_BY_KIND[input.kind]
  if (!allowed.has(file.type)) {
    throw new Error(
      `Unsupported file type: ${file.type || 'unknown'}. Accepted: ${Array.from(
        allowed,
      ).join(', ')}`,
    )
  }
  if (file.size > MAX_BYTES) {
    throw new Error(
      `File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB (max ${MAX_BYTES / 1024 / 1024} MB)`,
    )
  }

  const sourceBuf = Buffer.from(await file.arrayBuffer())
  const processed = await processForKind(sourceBuf, file.type, input.kind)

  const segments: string[] = [
    input.kind,
    input.designerId,
    input.projectId ?? '_',
    ...(input.ownerId ? [input.ownerId] : []),
    `${randomUUID()}.${processed.ext}`,
  ]
  const path = segments.join('/')

  const sb = supabaseAdmin()
  const { error } = await sb.storage
    .from(STORAGE_BUCKET)
    .upload(path, processed.buffer, {
      contentType: processed.contentType,
      upsert: false,
      cacheControl: '3600',
    })
  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const signedUrl = await signedAssetUrl(path)
  if (!signedUrl) throw new Error(`Storage upload succeeded but signing path failed: ${path}`)
  return {
    path,
    signedUrl,
    contentType: processed.contentType,
    size: processed.buffer.length,
    straightened: processed.straightened,
  }
}

// Default TTL for signed URLs: 1 hour. Long enough for a designer to
// browse the dashboard or open a PDF without re-fetching; short enough
// that a leaked URL stops working before tomorrow morning.
const DEFAULT_SIGNED_TTL_SEC = 60 * 60

// Mint a signed URL for a storage path. Returns null on failure (soft-fail)
// so callers don't crash SSR pages when a path is stale or the bucket is
// temporarily unreachable.
export async function signedAssetUrl(
  path: string,
  ttlSec: number = DEFAULT_SIGNED_TTL_SEC,
): Promise<string | null> {
  const sb = supabaseAdmin()
  const { data, error } = await sb.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, ttlSec)
  if (error || !data?.signedUrl) {
    console.error('[storage] sign failed for path', path, error?.message ?? 'no signedUrl returned')
    return null
  }
  return data.signedUrl
}

// Resolve a stored value (storage path OR external https URL OR null) to
// something a browser can fetch. Handles three cases:
//   * null/empty            → null
//   * starts with http(s)://
//       - looks like a legacy public URL into our bucket → extract the
//         path and sign it (transparent migration for any rows the SQL
//         migration didn't catch)
//       - otherwise (truly external — paste-a-URL, vendor catalog, etc.)
//         → return as-is
//   * anything else → treat as a path and sign it
export async function resolveAssetUrl(
  stored: string | null | undefined,
  ttlSec: number = DEFAULT_SIGNED_TTL_SEC,
): Promise<string | null> {
  if (!stored) return null
  const path = extractBucketPath(stored)
  if (path !== null) return signedAssetUrl(path, ttlSec)
  return stored
}

// Batched version. Issues a single signRequests call for everything that
// needs signing, leaves external URLs untouched, returns a parallel array.
// Use this on list-shaped responses (catalog, items list, etc.) so we
// don't fan out N HTTP signs.
export async function resolveAssetUrls(
  stored: Array<string | null | undefined>,
  ttlSec: number = DEFAULT_SIGNED_TTL_SEC,
): Promise<Array<string | null>> {
  const out: Array<string | null> = new Array(stored.length).fill(null)
  const toSign: Array<{ index: number; path: string }> = []
  for (let i = 0; i < stored.length; i++) {
    const v = stored[i]
    if (!v) {
      out[i] = null
      continue
    }
    const path = extractBucketPath(v)
    if (path !== null) toSign.push({ index: i, path })
    else out[i] = v
  }
  if (toSign.length === 0) return out

  const sb = supabaseAdmin()
  const { data, error } = await sb.storage
    .from(STORAGE_BUCKET)
    .createSignedUrls(
      toSign.map((t) => t.path),
      ttlSec,
    )
  if (error) {
    // Soft-fail per-item: leave any that signed successfully, null the rest.
    // This mirrors how the storage SDK can return partial results.
    console.error('[storage] batch sign failed', error)
  }
  const results = data ?? []
  for (let i = 0; i < toSign.length; i++) {
    const r = results[i]
    out[toSign[i]!.index] = r?.signedUrl ?? null
  }
  return out
}



// Augments a single row by signing the named URL fields. Returns a new
// object; the input is not mutated. `null` rows pass through unchanged.
export async function withSignedUrls<T extends object>(
  row: T | null | undefined,
  fields: ReadonlyArray<keyof T>,
  ttlSec?: number,
): Promise<T | null> {
  if (!row) return null
  const r = row as Record<string, unknown>
  const stored = fields.map(
    (f) => (r[f as string] as string | null | undefined) ?? null,
  )
  const signed = await resolveAssetUrls(stored, ttlSec)
  const out: Record<string, unknown> = { ...r }
  fields.forEach((f, i) => {
    out[f as string] = signed[i]
  })
  return out as T
}

// List version: signs a single field across many rows in one batched call.
export async function withSignedUrlsList<T extends object>(
  rows: T[] | null | undefined,
  field: keyof T,
  ttlSec?: number,
): Promise<T[]> {
  if (!rows || rows.length === 0) return []
  const stored = rows.map((r) => {
    const rec = r as Record<string, unknown>
    return (rec[field as string] as string | null | undefined) ?? null
  })
  const signed = await resolveAssetUrls(stored, ttlSec)
  return rows.map((r, i) => {
    const out: Record<string, unknown> = { ...(r as Record<string, unknown>) }
    out[field as string] = signed[i]
    return out as T
  })
}


interface ProcessedFile {
  buffer: Buffer
  contentType: string
  ext: string
  straightened?: boolean
}

async function processForKind(
  source: Buffer,
  contentType: string,
  kind: UploadKind,
): Promise<ProcessedFile> {
  if (kind === 'doc' || kind === 'receipt') {
    // Receipts and generic docs pass through. We don't recompress photos
    // because tax/audit best practice is to keep the original artifact —
    // and Supabase already enforces the bucket-level size cap.
    return {
      buffer: source,
      contentType,
      ext: extFromContentType(contentType),
    }
  }

  if (kind === 'item-image') {
    const norm = await normalizeImage(source, contentType, 'item-image')
    return { buffer: norm.buffer, contentType: norm.contentType, ext: norm.ext }
  }

  // kind === 'floor-plan'
  let imageBuf = source
  let imageType = contentType
  if (contentType === 'application/pdf') {
    imageBuf = await rasterizePdfFirstPage(source)
    imageType = 'image/png'
  }

  const norm = await normalizeImage(imageBuf, imageType, 'floor-plan')

  // SVG passes through normalize untouched and we skip AI — it's already
  // crisp at any zoom.
  if (norm.contentType === 'image/svg+xml') {
    return { buffer: norm.buffer, contentType: norm.contentType, ext: norm.ext }
  }

  // Tier-3: AI deskew + crop. Soft-fails to the normalized buffer.
  const straightened = await straightenFloorPlan(
    norm.buffer,
    norm.width,
    norm.height,
  )

  // Final pass: force-landscape + whiten-background. Always runs, whether
  // or not the AI step found corners.
  const finalImg = await postprocessFloorPlan(
    straightened.buffer,
    straightened.width,
    straightened.height,
  )

  return {
    buffer: finalImg.buffer,
    contentType: 'image/webp',
    ext: 'webp',
    straightened: straightened.applied,
  }
}

function extFromContentType(ct: string): string {
  switch (ct) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'image/svg+xml':
      return 'svg'
    case 'application/pdf':
      return 'pdf'
    default:
      return 'bin'
  }
}

export async function deleteAsset(path: string): Promise<void> {
  const sb = supabaseAdmin()
  const { error } = await sb.storage.from(STORAGE_BUCKET).remove([path])
  if (error) {
    // Don't throw — deletes are best-effort.
    console.warn('[storage] delete failed', path, error.message)
  }
}
