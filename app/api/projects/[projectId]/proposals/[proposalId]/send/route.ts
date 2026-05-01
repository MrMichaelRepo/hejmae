// Generate or rotate the proposal's magic-link token, mark it sent, and
// return the public URL the designer should share with the client.
//
// TODO: integrate Resend to actually email the link.
import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { loadOwnedProject } from '@/lib/auth/ownership'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, notFound } from '@/lib/errors'
import { generateMagicToken } from '@/lib/tokens'
import { env } from '@/lib/env'
import { logActivity } from '@/lib/activity'

interface Ctx {
  params: Promise<{ projectId: string; proposalId: string }>
}

export async function POST(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId, proposalId } = await params
    const { designerId } = await requireDesigner()
    await loadOwnedProject(designerId, projectId)

    const { data: existing, error: e1 } = await supabaseAdmin()
      .from('proposals')
      .select('id, magic_link_token')
      .eq('id', proposalId)
      .eq('project_id', projectId)
      .eq('designer_id', designerId)
      .maybeSingle()
    if (e1) throw e1
    if (!existing) throw notFound('Proposal not found')

    const token = existing.magic_link_token ?? generateMagicToken()

    const { data, error } = await supabaseAdmin()
      .from('proposals')
      .update({
        status: 'sent',
        magic_link_token: token,
        magic_link_revoked_at: null,
        sent_at: new Date().toISOString(),
      })
      .eq('id', proposalId)
      .eq('designer_id', designerId)
      .select()
      .single()
    if (error) throw error

    await logActivity({
      designerId,
      projectId,
      actorType: 'designer',
      actorId: designerId,
      eventType: 'proposal.sent',
      description: `Proposal sent to client`,
      metadata: { proposal_id: proposalId },
    })

    const url = `${env.appUrl()}/portal/proposals/${token}`
    return NextResponse.json({ data, magic_link_url: url })
  })
}
