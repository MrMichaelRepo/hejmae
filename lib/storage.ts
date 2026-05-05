// Supabase Storage helpers. All uploads go through the server using the
// secret key (service role), so we don't need per-object RLS — the API
// route enforces ownership before calling these.

import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase/server'

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

  const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
  const segments: string[] = [
    input.kind,
    input.designerId,
    input.projectId,
    ...(input.ownerId ? [input.ownerId] : []),
    `${randomUUID()}.${ext}`,
  ]
  const path = segments.join('/')

  const sb = supabaseAdmin()
  const arrayBuffer = await file.arrayBuffer()
  const { error } = await sb.storage.from(STORAGE_BUCKET).upload(path, arrayBuffer, {
    contentType: file.type,
    upsert: false,
    cacheControl: '3600',
  })
  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data: pub } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(path)
  return {
    path,
    publicUrl: pub.publicUrl,
    contentType: file.type,
    size: file.size,
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
