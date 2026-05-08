// /api/projects/[projectId]/uploads — multipart/form-data file upload.
//
// Form fields:
//   file (File, required)        — the binary
//   kind (string, required)      — 'floor-plan' | 'item-image' | 'doc'
//   owner_id (uuid, optional)    — e.g. an item id to scope under
//
// Returns: { path, signedUrl, contentType, size }
//
// Why server-side: we authenticate via Clerk, enforce project ownership in
// code, and use the Supabase secret key to write. The bucket is private —
// the response includes a short-lived signedUrl for immediate display, but
// the caller MUST persist `path` (not signedUrl) to any DB column.

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { loadOwnedProject } from '@/lib/auth/ownership'
import { withErrorHandling, badRequest, tooManyRequests } from '@/lib/errors'
import { uploadAsset, type UploadKind } from '@/lib/storage'
import { checkRateLimit } from '@/lib/ratelimit'

export const runtime = 'nodejs'
// Floor-plan uploads run a multi-stage pipeline (PDF rasterize, sharp
// resize/encode, Claude Haiku vision call). 60s leaves comfortable headroom;
// requires Vercel Pro (Hobby caps at 10s).
export const maxDuration = 60

interface Ctx {
  params: Promise<{ projectId: string }>
}

const VALID_KINDS = new Set<UploadKind>(['floor-plan', 'item-image', 'doc'])

export async function POST(req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId } = await params
    const { designerId } = await requireDesigner()
    const rl = await checkRateLimit('upload', `designer:${designerId}`)
    if (!rl.ok) throw tooManyRequests()
    await loadOwnedProject(designerId, projectId)

    const form = await req.formData()
    const file = form.get('file')
    const kindRaw = form.get('kind')
    const ownerId = form.get('owner_id')

    if (!(file instanceof File)) throw badRequest('file is required')
    const kind = String(kindRaw ?? '') as UploadKind
    if (!VALID_KINDS.has(kind)) {
      throw badRequest(
        `kind must be one of: ${Array.from(VALID_KINDS).join(', ')}`,
      )
    }

    const result = await uploadAsset({
      kind,
      designerId,
      projectId,
      file,
      ownerId: typeof ownerId === 'string' && ownerId ? ownerId : undefined,
    })

    return NextResponse.json({ data: result }, { status: 201 })
  })
}
