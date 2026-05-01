import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { loadOwnedProject } from '@/lib/auth/ownership'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, notFound } from '@/lib/errors'
import { updateRoom } from '@/lib/validations/room'

interface Ctx {
  params: Promise<{ projectId: string; roomId: string }>
}

async function loadRoom(designerId: string, projectId: string, roomId: string) {
  const { data, error } = await supabaseAdmin()
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .eq('project_id', projectId)
    .eq('designer_id', designerId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw notFound('Room not found')
  return data
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId, roomId } = await params
    const { designerId } = await requireDesigner()
    await loadOwnedProject(designerId, projectId)
    const room = await loadRoom(designerId, projectId, roomId)
    return NextResponse.json({ data: room })
  })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId, roomId } = await params
    const { designerId } = await requireDesigner()
    await loadOwnedProject(designerId, projectId)
    await loadRoom(designerId, projectId, roomId)
    const body = updateRoom.parse(await req.json())

    const { data, error } = await supabaseAdmin()
      .from('rooms')
      .update(body)
      .eq('id', roomId)
      .eq('designer_id', designerId)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ data })
  })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId, roomId } = await params
    const { designerId } = await requireDesigner()
    await loadOwnedProject(designerId, projectId)
    await loadRoom(designerId, projectId, roomId)

    const { error } = await supabaseAdmin()
      .from('rooms')
      .delete()
      .eq('id', roomId)
      .eq('designer_id', designerId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  })
}
