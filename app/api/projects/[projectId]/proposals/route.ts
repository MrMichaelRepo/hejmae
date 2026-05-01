import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { loadOwnedProject } from '@/lib/auth/ownership'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, badRequest } from '@/lib/errors'
import { createProposal } from '@/lib/validations/proposal'

interface Ctx {
  params: Promise<{ projectId: string }>
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId } = await params
    const { designerId } = await requireDesigner()
    await loadOwnedProject(designerId, projectId)

    const { data, error } = await supabaseAdmin()
      .from('proposals')
      .select('*, proposal_rooms(*)')
      .eq('project_id', projectId)
      .eq('designer_id', designerId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ data })
  })
}

export async function POST(req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId } = await params
    const { designerId } = await requireDesigner()
    await loadOwnedProject(designerId, projectId)
    const body = createProposal.parse(await req.json())

    // Validate that all room_ids belong to this project + designer.
    const { data: rooms, error: roomsErr } = await supabaseAdmin()
      .from('rooms')
      .select('id')
      .in('id', body.room_ids)
      .eq('project_id', projectId)
      .eq('designer_id', designerId)
    if (roomsErr) throw roomsErr
    if ((rooms?.length ?? 0) !== body.room_ids.length) {
      throw badRequest('One or more room_ids are invalid')
    }

    const { data: proposal, error } = await supabaseAdmin()
      .from('proposals')
      .insert({
        designer_id: designerId,
        project_id: projectId,
        status: 'draft',
      })
      .select()
      .single()
    if (error) throw error

    const { error: prErr } = await supabaseAdmin()
      .from('proposal_rooms')
      .insert(
        body.room_ids.map((room_id, i) => ({
          designer_id: designerId,
          proposal_id: proposal.id,
          room_id,
          position: i,
        })),
      )
    if (prErr) throw prErr

    return NextResponse.json({ data: proposal }, { status: 201 })
  })
}
