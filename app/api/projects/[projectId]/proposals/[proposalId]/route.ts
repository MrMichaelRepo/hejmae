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

      // Merge-aware diff: keep existing proposal_rooms rows when their
      // room_id is still in the new set so client-side state
      // (approved_at, client_comment) survives a re-save. Only positions
      // get patched for kept rooms.
      const sb = supabaseAdmin()
      const { data: existing, error: existingErr } = await sb
        .from('proposal_rooms')
        .select('id, room_id, position')
        .eq('proposal_id', proposalId)
        .eq('designer_id', designerId)
      if (existingErr) throw existingErr

      const existingByRoomId = new Map(
        (existing ?? []).map((r) => [r.room_id, r]),
      )
      const desiredPositionByRoomId = new Map(
        body.room_ids.map((roomId, i) => [roomId, i]),
      )

      const toDelete = (existing ?? [])
        .filter((r) => !desiredPositionByRoomId.has(r.room_id))
        .map((r) => r.id)
      const toInsert = body.room_ids
        .map((roomId, i) => ({ roomId, position: i }))
        .filter(({ roomId }) => !existingByRoomId.has(roomId))
      const toReposition = (existing ?? []).filter((r) => {
        const desired = desiredPositionByRoomId.get(r.room_id)
        return desired !== undefined && desired !== r.position
      })

      if (toDelete.length) {
        const { error } = await sb
          .from('proposal_rooms')
          .delete()
          .in('id', toDelete)
          .eq('designer_id', designerId)
        if (error) throw error
      }
      if (toInsert.length) {
        const { error } = await sb.from('proposal_rooms').insert(
          toInsert.map(({ roomId, position }) => ({
            designer_id: designerId,
            proposal_id: proposalId,
            room_id: roomId,
            position,
          })),
        )
        if (error) throw error
      }
      for (const r of toReposition) {
        const { error } = await sb
          .from('proposal_rooms')
          .update({ position: desiredPositionByRoomId.get(r.room_id) })
          .eq('id', r.id)
          .eq('designer_id', designerId)
        if (error) throw error
      }
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
