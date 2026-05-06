// /api/projects/[projectId]/floor-plan/vectorize — POST
//
// Runs Haiku-vision extraction over the project's existing floor_plan_url
// and persists the resulting spec to projects.floor_plan_vector.
//
// Returns: { data: FloorPlanVector } on success
//          400 if the project has no floor plan to vectorize
//          422 if Haiku returned nothing usable
//          500 on unexpected failures (Anthropic outage, etc.)
//
// Why a dedicated endpoint (vs. baking it into uploads): the user opts
// into vectorization explicitly — it costs an Anthropic call and replaces
// the existing spec. Keeping it separate also means re-running it later
// (after edits, after a better model) is a single button click.

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { loadOwnedProject } from '@/lib/auth/ownership'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, badRequest, HttpError } from '@/lib/errors'
import { extractFloorPlan } from '@/lib/image/extract'

export const runtime = 'nodejs'
// Vision call + sharp resize. 60s leaves headroom on Vercel Pro.
export const maxDuration = 60

interface Ctx {
  params: Promise<{ projectId: string }>
}

export async function POST(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId } = await params
    const { designerId } = await requireDesigner()
    const project = await loadOwnedProject(designerId, projectId)

    if (!project.floor_plan_url) {
      throw badRequest('Project has no floor plan to vectorize')
    }

    // Fetch the current floor plan. Bucket is public so a plain fetch
    // works; falls back through the same network path the browser uses.
    const imgRes = await fetch(project.floor_plan_url, { cache: 'no-store' })
    if (!imgRes.ok) {
      throw new HttpError(
        502,
        'upstream_fetch_failed',
        `Could not fetch floor plan image (${imgRes.status})`,
      )
    }
    const buffer = Buffer.from(await imgRes.arrayBuffer())

    const { spec } = await extractFloorPlan({ buffer })
    if (!spec) {
      throw new HttpError(
        422,
        'extraction_failed',
        'Vision model could not extract a usable floor plan from this image. Try a clearer photo or scan.',
      )
    }

    const { data, error } = await supabaseAdmin()
      .from('projects')
      .update({ floor_plan_vector: spec })
      .eq('id', projectId)
      .eq('designer_id', designerId)
      .select('floor_plan_vector')
      .single()
    if (error) throw error

    return NextResponse.json({ data: data.floor_plan_vector }, { status: 200 })
  })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId } = await params
    const { designerId } = await requireDesigner()
    await loadOwnedProject(designerId, projectId)

    const { error } = await supabaseAdmin()
      .from('projects')
      .update({ floor_plan_vector: null })
      .eq('id', projectId)
      .eq('designer_id', designerId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  })
}
