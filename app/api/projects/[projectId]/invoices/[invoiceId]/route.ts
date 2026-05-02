import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { loadOwnedProject } from '@/lib/auth/ownership'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, notFound, badRequest } from '@/lib/errors'
import { generateMagicToken } from '@/lib/tokens'
import { logActivity } from '@/lib/activity'
import { env } from '@/lib/env'
import { sendEmail } from '@/lib/email/send'
import { renderInvoiceEmail } from '@/lib/email/templates'

interface Ctx {
  params: Promise<{ projectId: string; invoiceId: string }>
}

async function loadInvoice(designerId: string, projectId: string, invoiceId: string) {
  const { data, error } = await supabaseAdmin()
    .from('invoices')
    .select('*, invoice_line_items(*), payments(*)')
    .eq('id', invoiceId)
    .eq('project_id', projectId)
    .eq('designer_id', designerId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw notFound('Invoice not found')
  return data
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId, invoiceId } = await params
    const { designerId } = await requireDesigner()
    await loadOwnedProject(designerId, projectId)
    const inv = await loadInvoice(designerId, projectId, invoiceId)
    return NextResponse.json({ data: inv })
  })
}

// PATCH supports either a status transition (e.g. mark sent) or a notes
// update. Editing line items requires a separate flow — TODO.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId, invoiceId } = await params
    const { designerId, user } = await requireDesigner()
    const project = await loadOwnedProject(designerId, projectId)
    const existing = await loadInvoice(designerId, projectId, invoiceId)

    const body = (await req.json()) as {
      action?: 'send' | 'mark_paid'
      notes?: string | null
    }

    const updates: Record<string, unknown> = {}
    if (body.notes !== undefined) updates.notes = body.notes

    if (body.action === 'send') {
      if (existing.status === 'paid') {
        throw badRequest('Invoice is already paid')
      }
      updates.status = 'sent'
      updates.sent_at = new Date().toISOString()
      if (!existing.magic_link_token) {
        updates.magic_link_token = generateMagicToken()
      }
    } else if (body.action === 'mark_paid') {
      // Manual mark-paid (e.g. paid by check). Stripe-driven payments are
      // recorded by the webhook handler. TODO: reconcile any over-payment.
      updates.status = 'paid'
      updates.paid_at = new Date().toISOString()
    }

    const { data, error } = await supabaseAdmin()
      .from('invoices')
      .update(updates)
      .eq('id', invoiceId)
      .eq('designer_id', designerId)
      .select()
      .single()
    if (error) throw error

    let emailResult: { ok: boolean; reason?: string } | null = null
    if (body.action === 'send' && data.magic_link_token) {
      const url = `${env.appUrl()}/portal/invoices/${data.magic_link_token}`

      if (project.client_id) {
        const { data: client } = await supabaseAdmin()
          .from('clients')
          .select('name, email')
          .eq('id', project.client_id)
          .maybeSingle()
        if (client?.email) {
          const tpl = renderInvoiceEmail({
            brand: {
              studio_name: user.studio_name,
              name: user.name,
              logo_url: user.logo_url,
              brand_color: user.brand_color,
            },
            clientName: client.name,
            projectName: project.name,
            invoiceType: data.type,
            totalCents: data.total_cents,
            invoiceUrl: url,
            notes: data.notes,
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
        eventType: 'invoice.sent',
        description: `Invoice sent${emailResult?.ok ? ' (email delivered)' : ''}`,
        metadata: { invoice_id: invoiceId, email: emailResult },
      })
    }

    const out: Record<string, unknown> = { data, email: emailResult }
    if (data.magic_link_token) {
      out.magic_link_url = `${env.appUrl()}/portal/invoices/${data.magic_link_token}`
    }
    return NextResponse.json(out)
  })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId, invoiceId } = await params
    const { designerId } = await requireDesigner()
    await loadOwnedProject(designerId, projectId)
    const existing = await loadInvoice(designerId, projectId, invoiceId)
    if (existing.status !== 'draft') {
      throw badRequest('Only draft invoices can be deleted')
    }
    const { error } = await supabaseAdmin()
      .from('invoices')
      .delete()
      .eq('id', invoiceId)
      .eq('designer_id', designerId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  })
}
