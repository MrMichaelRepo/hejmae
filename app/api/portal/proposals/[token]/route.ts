// Public client portal: view a proposal by magic-link token.
//
// We intentionally hand-pick which fields go to the client. trade_price is
// not part of any returned shape, and stripTrade() is a belt-and-suspenders
// scrub before we serialize.
import { NextResponse, type NextRequest } from 'next/server'
import { loadProposalByToken } from '@/lib/portal/auth'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'
import { stripTrade } from '@/lib/portal/sanitize'

interface Ctx {
  params: Promise<{ token: string }>
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { token } = await params
    const { proposal, rooms } = await loadProposalByToken(token)

    const sb = supabaseAdmin()

    // Pull the rooms named in this proposal AND the items in those rooms.
    // Note the explicit column lists — we do NOT select * to ensure
    // trade_price_cents never enters the JSON.
    const roomIds = rooms.map((r) => r.room_id)
    const [{ data: roomDetails }, { data: items }, { data: project }, { data: designer }] =
      await Promise.all([
        sb
          .from('rooms')
          .select('id, name, position')
          .in('id', roomIds.length ? roomIds : ['00000000-0000-0000-0000-000000000000']),
        sb
          .from('items')
          .select(
            'id, room_id, name, vendor, image_url, retail_price_cents, client_price_cents, quantity, status, floor_plan_pin_x, floor_plan_pin_y',
          )
          .in('room_id', roomIds.length ? roomIds : ['00000000-0000-0000-0000-000000000000'])
          .eq('project_id', proposal.project_id),
        sb
          .from('projects')
          .select('id, name, location, floor_plan_url')
          .eq('id', proposal.project_id)
          .maybeSingle(),
        sb
          .from('users')
          .select('studio_name, name, logo_url, brand_color')
          .eq('id', proposal.designer_id)
          .maybeSingle(),
      ])

    const payload = stripTrade({
      proposal: {
        id: proposal.id,
        status: proposal.status,
        sent_at: proposal.sent_at,
        client_notes: proposal.client_notes,
      },
      project,
      designer,
      rooms: rooms.map((pr) => ({
        proposal_room_id: pr.id,
        room_id: pr.room_id,
        position: pr.position,
        approved_at: pr.approved_at,
        client_comment: pr.client_comment,
        room: roomDetails?.find((r) => r.id === pr.room_id) ?? null,
        items: items?.filter((it) => it.room_id === pr.room_id) ?? [],
      })),
    })

    return NextResponse.json({ data: payload })
  })
}
