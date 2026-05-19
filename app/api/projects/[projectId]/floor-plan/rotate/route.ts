// /api/projects/[projectId]/floor-plan/rotate — POST
//
// Rotate the floor-plan image 90° clockwise and transform every room
// rectangle / polygon / item pin so they stay attached to the same parts
// of the drawing in the rotated frame.
//
// Coordinate transform (CW 90°), all 0..1 fractional:
//   point   (x, y)        → (1 - y, x)
//   rect    (x, y, w, h)  → (1 - y - h, x, h, w)
//
// Sequential writes (Supabase JS client has no client-side transactions):
//   1. fetch + rotate + upload new image
//   2. update projects.floor_plan_url
//   3. update rooms (rect + polygon)
//   4. update items (pin coords)
//   5. delete old storage object (best-effort)
// If step 3 or 4 fails after step 2 commits, the image is correct but
// coords are stale — user can rotate again to recover.

import { NextResponse, type NextRequest } from 'next/server'
import sharp from 'sharp'
import { randomUUID } from 'crypto'
import { requireDesigner } from '@/lib/auth/designer'
import { loadOwnedProject } from '@/lib/auth/ownership'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, badRequest, HttpError } from '@/lib/errors'
import {
  STORAGE_BUCKET,
  resolveAssetUrl,
  deleteAsset,
  signedAssetUrl,
} from '@/lib/storage'
import { extractBucketPath } from '@/lib/storage-utils'

export const runtime = 'nodejs'
export const maxDuration = 30

interface Ctx {
  params: Promise<{ projectId: string }>
}

interface PolygonPoint {
  x: number
  y: number
}

function rotatePoint(p: PolygonPoint): PolygonPoint {
  return { x: 1 - p.y, y: p.x }
}

export async function POST(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId } = await params
    const { designerId } = await requireDesigner()
    const project = await loadOwnedProject(designerId, projectId)

    if (!project.floor_plan_url) {
      throw badRequest('Project has no floor plan to rotate')
    }
    const oldPath = extractBucketPath(project.floor_plan_url) ?? project.floor_plan_url

    const signed = await resolveAssetUrl(project.floor_plan_url, 60 * 5)
    if (!signed) throw badRequest('Could not resolve floor plan asset')

    const res = await fetch(signed, { cache: 'no-store' })
    if (!res.ok) {
      throw new HttpError(502, 'upstream_fetch_failed', `Could not fetch floor plan (${res.status})`)
    }
    const inputBuf = Buffer.from(await res.arrayBuffer())

    const rotated = await sharp(inputBuf)
      .rotate(90, { background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .webp({ quality: 78 })
      .toBuffer()

    const newPath = `floor-plan/${designerId}/${projectId}/${randomUUID()}.webp`
    const sb = supabaseAdmin()
    const up = await sb.storage.from(STORAGE_BUCKET).upload(newPath, rotated, {
      contentType: 'image/webp',
      upsert: false,
      cacheControl: '3600',
    })
    if (up.error) throw new Error(`Storage upload failed: ${up.error.message}`)

    const projUpdate = await sb
      .from('projects')
      .update({ floor_plan_url: newPath })
      .eq('id', projectId)
      .eq('designer_id', designerId)
    if (projUpdate.error) throw projUpdate.error

    // Rooms: transform rect coords and polygon points.
    const roomsRes = await sb
      .from('rooms')
      .select('id, floor_plan_x, floor_plan_y, floor_plan_width, floor_plan_height, floor_plan_polygon')
      .eq('project_id', projectId)
      .eq('designer_id', designerId)
    if (roomsRes.error) throw roomsRes.error

    for (const r of roomsRes.data ?? []) {
      const patch: Record<string, unknown> = {}
      if (
        r.floor_plan_x != null &&
        r.floor_plan_y != null &&
        r.floor_plan_width != null &&
        r.floor_plan_height != null
      ) {
        patch.floor_plan_x = 1 - r.floor_plan_y - r.floor_plan_height
        patch.floor_plan_y = r.floor_plan_x
        patch.floor_plan_width = r.floor_plan_height
        patch.floor_plan_height = r.floor_plan_width
      }
      if (Array.isArray(r.floor_plan_polygon) && r.floor_plan_polygon.length > 0) {
        patch.floor_plan_polygon = (r.floor_plan_polygon as PolygonPoint[]).map(rotatePoint)
      }
      if (Object.keys(patch).length === 0) continue
      const up = await sb.from('rooms').update(patch).eq('id', r.id).eq('designer_id', designerId)
      if (up.error) throw up.error
    }

    // Items: transform pin coords.
    const itemsRes = await sb
      .from('items')
      .select('id, floor_plan_pin_x, floor_plan_pin_y')
      .eq('project_id', projectId)
      .eq('designer_id', designerId)
      .not('floor_plan_pin_x', 'is', null)
      .not('floor_plan_pin_y', 'is', null)
    if (itemsRes.error) throw itemsRes.error

    for (const it of itemsRes.data ?? []) {
      if (it.floor_plan_pin_x == null || it.floor_plan_pin_y == null) continue
      const up = await sb
        .from('items')
        .update({
          floor_plan_pin_x: 1 - it.floor_plan_pin_y,
          floor_plan_pin_y: it.floor_plan_pin_x,
        })
        .eq('id', it.id)
        .eq('designer_id', designerId)
      if (up.error) throw up.error
    }

    if (oldPath && oldPath !== newPath) {
      await deleteAsset(oldPath)
    }

    const newSigned = await signedAssetUrl(newPath)
    return NextResponse.json({ data: { floor_plan_url: newSigned } })
  })
}
