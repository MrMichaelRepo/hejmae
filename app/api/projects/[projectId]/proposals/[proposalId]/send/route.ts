// Generate or rotate the proposal's magic-link token, mark it sent, send
// the email via Resend (no-op if RESEND_API_KEY is unset), and return the
// magic-link URL.
import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { loadOwnedProject } from '@/lib/auth/ownership'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, notFound } from '@/lib/errors'
import { generateMagicToken } from '@/lib/tokens'
import { env } from '@/lib/env'
import { logActivity } from '@/lib/activity'
import { sendEmail } from '@/lib/email/send'
import { renderProposalEmail } from '@/lib/email/templates'

interface Ctx {
  params: Promise<{ projectId: string; proposalId: string }>
}

export async function POST(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId, proposalId } = await params
    const { designerId, user } = await requireDesigner()
    const project = await loadOwnedProject(designerId, projectId)

    const { data: existing, error: e1 } = await supabaseAdmin()
      .from('proposals')
      .select('id, magic_link_token, client_notes')
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

    const url = `${env.appUrl()}/portal/proposals/${token}`

    // Email the client if we have one. Don't block the response on failure.
    let emailResult: { ok: boolean; reason?: string } | null = null
    if (project.client_id) {
      const { data: client } = await supabaseAdmin()
        .from('clients')
        .select('name, email')
        .eq('id', project.client_id)
        .maybeSingle()
      if (client?.email) {
        const tpl = renderProposalEmail({
          brand: {
            studio_name: user.studio_name,
            name: user.name,
            logo_url: user.logo_url,
            brand_color: user.brand_color,
          },
          clientName: client.name,
          projectName: project.name,
          proposalUrl: url,
          notes: existing.client_notes,
        })
        emailResult = await sendEmail({
          to: client.email,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          replyTo: user.email,
        })
      }
    }

    await logActivity({
      designerId,
      projectId,
      actorType: 'designer',
      actorId: designerId,
      eventType: 'proposal.sent',
      description: `Proposal sent to client${emailResult?.ok ? ' (email delivered)' : ''}`,
      metadata: { proposal_id: proposalId, email: emailResult },
    })

    return NextResponse.json({ data, magic_link_url: url, email: emailResult })
  })
}
