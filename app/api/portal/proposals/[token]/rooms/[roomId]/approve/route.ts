// Client portal: approve a single room within a sent proposal.
import { NextResponse, type NextRequest } from 'next/server'
import { loadProposalByToken } from '@/lib/portal/auth'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, notFound } from '@/lib/errors'
import { portalApproveRoom } from '@/lib/validations/proposal'
import { logActivity } from '@/lib/activity'

interface Ctx {
  params: Promise<{ token: string; roomId: string }>
}

export async function POST(req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { token, roomId } = await params
    const { proposal, rooms } = await loadProposalByToken(token)

    const target = rooms.find((r) => r.room_id === roomId)
    if (!target) throw notFound('Room not part of this proposal')

    const body = portalApproveRoom.parse(
      req.body ? await req.json().catch(() => ({})) : {},
    )

    const sb = supabaseAdmin()
    const { error } = await sb
      .from('proposal_rooms')
      .update({
        approved_at: new Date().toISOString(),
        client_comment: body.client_comment ?? null,
      })
      .eq('id', target.id)
    if (error) throw error

    // Recompute proposal-level status: fully_approved if every room has an
    // approved_at, otherwise partially_approved.
    const { data: refreshed } = await sb
      .from('proposal_rooms')
      .select('approved_at')
      .eq('proposal_id', proposal.id)
    const all = refreshed ?? []
    const everyApproved = all.length > 0 && all.every((r) => r.approved_at)
    await sb
      .from('proposals')
      .update({
        status: everyApproved ? 'fully_approved' : 'partially_approved',
      })
      .eq('id', proposal.id)

    // Flip items in this room to 'approved' (per the spec, client approval
    // is per-room and rolls down to all line items in that room).
    await sb
      .from('items')
      .update({ status: 'approved' })
      .eq('room_id', roomId)
      .eq('project_id', proposal.project_id)
      .eq('status', 'sourcing')

    await logActivity({
      designerId: proposal.designer_id,
      projectId: proposal.project_id,
      actorType: 'client',
      eventType: 'proposal.room_approved',
      description: `Client approved a room`,
      metadata: { proposal_id: proposal.id, room_id: roomId },
    })

    return NextResponse.json({ ok: true })
  })
}
