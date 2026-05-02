import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { loadOwnedProject } from '@/lib/auth/ownership'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, notFound, badRequest } from '@/lib/errors'
import { updateProposal } from '@/lib/validations/proposal'

interface Ctx {
  params: Promise<{ projectId: string; proposalId: string }>
}

async function loadProposal(designerId: string, projectId: string, proposalId: string) {
  const { data, error } = await supabaseAdmin()
    .from('proposals')
    .select('*, proposal_rooms(*)')
    .eq('id', proposalId)
    .eq('project_id', projectId)
    .eq('designer_id', designerId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw notFound('Proposal not found')
  return data
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId, proposalId } = await params
    const { designerId } = await requireDesigner()
    await loadOwnedProject(designerId, projectId)
    const proposal = await loadProposal(designerId, projectId, proposalId)
    return NextResponse.json({ data: proposal })
  })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId, proposalId } = await params
    const { designerId } = await requireDesigner()
    await loadOwnedProject(designerId, projectId)
    await loadProposal(designerId, projectId, proposalId)
    const body = updateProposal.parse(await req.json())

    const updates: Record<string, unknown> = {}
    if (body.client_notes !== undefined) updates.client_notes = body.client_notes

    if (Object.keys(updates).length) {
      const { error } = await supabaseAdmin()
        .from('proposals')
        .update(updates)
        .eq('id', proposalId)
        .eq('designer_id', designerId)
      if (error) throw error
    }

    if (body.room_ids) {
      const uniqueRoomIds = [...new Set(body.room_ids)]
      if (uniqueRoomIds.length !== body.room_ids.length) {
        throw badRequest('room_ids contains duplicate ids')
      }
      if (uniqueRoomIds.length) {
        const { data: rooms, error: roomErr } = await supabaseAdmin()
          .from('rooms')
          .select('id')
          .in('id', uniqueRoomIds)
          .eq('project_id', projectId)
          .eq('designer_id', designerId)
        if (roomErr) throw roomErr
        if ((rooms ?? []).length !== uniqueRoomIds.length) {
          throw badRequest(
            'One or more room_ids do not belong to this project',
          )
        }
      }

      // Replace the room set entirely. TODO: smarter diff that preserves
      // approval state on rooms that are still present.
      await supabaseAdmin()
        .from('proposal_rooms')
        .delete()
        .eq('proposal_id', proposalId)
        .eq('designer_id', designerId)
      const { error } = await supabaseAdmin()
        .from('proposal_rooms')
        .insert(
          body.room_ids.map((room_id, i) => ({
            designer_id: designerId,
            proposal_id: proposalId,
            room_id,
            position: i,
          })),
        )
      if (error) throw error
    }

    const fresh = await loadProposal(designerId, projectId, proposalId)
    return NextResponse.json({ data: fresh })
  })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId, proposalId } = await params
    const { designerId } = await requireDesigner()
    await loadOwnedProject(designerId, projectId)
    await loadProposal(designerId, projectId, proposalId)

    const { error } = await supabaseAdmin()
      .from('proposals')
      .delete()
      .eq('id', proposalId)
      .eq('designer_id', designerId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  })
}
