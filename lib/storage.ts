// Supabase Storage helpers. All uploads go through the server using the
// secret key (service role), so we don't need per-object RLS — the API
// route enforces ownership before calling these.
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

export type UploadKind = 'floor-plan' | 'item-image' | 'doc'

const ALLOWED_BY_KIND: Record<UploadKind, Set<string>> = {
  'floor-plan': ALLOWED_DOC_TYPES,
  'item-image': ALLOWED_IMAGE_TYPES,
  doc: ALLOWED_DOC_TYPES,
}

export interface UploadInput {
  kind: UploadKind
  designerId: string
  projectId: string
  file: File
  // Optional sub-key (e.g. itemId) for nested grouping.
  ownerId?: string
}

export interface UploadResult {
  path: string
  publicUrl: string
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
    input.projectId,
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

  const { data: pub } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(path)
  return {
    path,
    publicUrl: pub.publicUrl,
    contentType: processed.contentType,
    size: processed.buffer.length,
    straightened: processed.straightened,
  }
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
  if (kind === 'doc') {
    // Documents pass through. PDF stays PDF, images stay as uploaded.
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

  const straightened = await straightenFloorPlan(
    norm.buffer,
    norm.width,
    norm.height,
  )
  return {
    buffer: straightened.buffer,
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
