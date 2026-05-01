import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { loadOwnedProject } from '@/lib/auth/ownership'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'
import { createRoom } from '@/lib/validations/room'

interface Ctx {
  params: Promise<{ projectId: string }>
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId } = await params
    const { designerId } = await requireDesigner()
    await loadOwnedProject(designerId, projectId)

    const { data, error } = await supabaseAdmin()
      .from('rooms')
      .select('*')
      .eq('project_id', projectId)
      .eq('designer_id', designerId)
      .order('position', { ascending: true })
    if (error) throw error
    return NextResponse.json({ data })
  })
}

export async function POST(req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId } = await params
    const { designerId } = await requireDesigner()
    await loadOwnedProject(designerId, projectId)
    const body = createRoom.parse(await req.json())

    const { data, error } = await supabaseAdmin()
      .from('rooms')
      .insert({
        designer_id: designerId,
        project_id: projectId,
        name: body.name,
        floor_plan_x: body.floor_plan_x ?? null,
        floor_plan_y: body.floor_plan_y ?? null,
        floor_plan_width: body.floor_plan_width ?? null,
        floor_plan_height: body.floor_plan_height ?? null,
        position: body.position ?? 0,
      })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ data }, { status: 201 })
  })
}
