import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { loadOwnedProject } from '@/lib/auth/ownership'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, notFound, badRequest } from '@/lib/errors'
import { logActivity } from '@/lib/activity'
import { env } from '@/lib/env'
import { sendEmail } from '@/lib/email/send'
import { renderPOEmail } from '@/lib/email/templates'

interface Ctx {
  params: Promise<{ projectId: string; poId: string }>
}

async function loadPo(designerId: string, projectId: string, poId: string) {
  const { data, error } = await supabaseAdmin()
    .from('purchase_orders')
    .select('*, purchase_order_line_items(*)')
    .eq('id', poId)
    .eq('project_id', projectId)
    .eq('designer_id', designerId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw notFound('Purchase order not found')
  return data
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId, poId } = await params
    const { designerId, role, permissions } = await requireDesigner()
    requirePermission({ role, permissions }, 'po:manage')
    await loadOwnedProject(designerId, projectId)
    const po = await loadPo(designerId, projectId, poId)
    return NextResponse.json({ data: po })
  })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId, poId } = await params
    const { designerId, user, role, permissions } = await requireDesigner()
    requirePermission({ role, permissions }, 'po:manage')
    const project = await loadOwnedProject(designerId, projectId)
    await loadPo(designerId, projectId, poId)

    const body = (await req.json()) as {
      action?:
        | 'send'
        | 'mark_acknowledged'
        | 'mark_shipped'
        | 'mark_received'
        | 'mark_delivered'
        | 'mark_complete'
      pdf_url?: string | null
      expected_lead_time_days?: number | null
      expected_delivery_date?: string | null
      shipped_at?: string | null
      delivered_at?: string | null
      tracking_number?: string | null
      tracking_url?: string | null
      vendor_name?: string
      vendor_email?: string | null
      notes?: string | null
    }
    const updates: Record<string, unknown> = {}
    if (body.pdf_url !== undefined) updates.pdf_url = body.pdf_url
    if (body.expected_lead_time_days !== undefined)
      updates.expected_lead_time_days = body.expected_lead_time_days
    if (body.expected_delivery_date !== undefined)
      updates.expected_delivery_date = body.expected_delivery_date
    if (body.shipped_at !== undefined) updates.shipped_at = body.shipped_at
    if (body.delivered_at !== undefined) updates.delivered_at = body.delivered_at
    if (body.tracking_number !== undefined)
      updates.tracking_number = body.tracking_number
    if (body.tracking_url !== undefined) updates.tracking_url = body.tracking_url
    if (body.vendor_name !== undefined) updates.vendor_name = body.vendor_name
    if (body.vendor_email !== undefined)
      updates.vendor_email = body.vendor_email
    if (body.notes !== undefined) updates.notes = body.notes

    const nowIso = new Date().toISOString()
    switch (body.action) {
      case 'send':
        updates.status = 'sent'
        updates.sent_at = nowIso
        break
      case 'mark_acknowledged':
        updates.status = 'acknowledged'
        break
      case 'mark_shipped':
        updates.shipped_at = nowIso
        // Don't transition main status — shipped is in-flight; leave as
        // acknowledged/sent.
        break
      case 'mark_received':
        updates.status = 'partially_received'
        break
      case 'mark_delivered':
        updates.delivered_at = nowIso
        updates.status = 'complete'
        break
      case 'mark_complete':
        updates.status = 'complete'
        break
      case undefined:
        break
      default:
        throw badRequest('Unknown action')
    }
    if (!Object.keys(updates).length) {
      throw badRequest('No valid fields to update')
    }

    const { data, error } = await supabaseAdmin()
      .from('purchase_orders')
      .update(updates)
      .eq('id', poId)
      .eq('designer_id', designerId)
      .select()
      .single()
    if (error) throw error

    let emailResult: { ok: boolean; reason?: string } | null = null
    if (body.action === 'send') {
      // Compute total from line items for the email body.
      const { data: lines } = await supabaseAdmin()
        .from('purchase_order_line_items')
        .select('total_trade_price_cents')
        .eq('po_id', poId)
        .eq('designer_id', designerId)
      const total = (lines ?? []).reduce(
        (a, l) => a + l.total_trade_price_cents,
        0,
      )

      if (data.vendor_email) {
        const printUrl = `${env.appUrl()}/dashboard/projects/${projectId}/purchase-orders/${poId}/print`
        const tpl = renderPOEmail({
          brand: {
            studio_name: user.studio_name,
            name: user.name,
            logo_url: user.logo_url,
            brand_color: user.brand_color,
          },
          vendorName: data.vendor_name,
          projectName: project.name,
          poId,
          totalCents: total,
          expectedLeadTimeDays: data.expected_lead_time_days,
          printUrl,
          notes: data.notes,
        })
        emailResult = await sendEmail({
          to: data.vendor_email,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          replyTo: user.email,
        })
      }

      await logActivity({
        designerId,
        projectId,
        actorType: 'designer',
        actorId: designerId,
        eventType: 'po.sent',
        description: `PO sent to ${data.vendor_name}${emailResult?.ok ? ' (email delivered)' : ''}`,
        metadata: { po_id: poId, email: emailResult },
      })
    }

    return NextResponse.json({ data, email: emailResult })
  })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId, poId } = await params
    const { designerId, role, permissions } = await requireDesigner()
    requirePermission({ role, permissions }, 'po:manage')
    await loadOwnedProject(designerId, projectId)
    const existing = await loadPo(designerId, projectId, poId)
    if (existing.status !== 'draft') {
      throw badRequest('Only draft POs can be deleted')
    }
    const { error } = await supabaseAdmin()
      .from('purchase_orders')
      .delete()
      .eq('id', poId)
      .eq('designer_id', designerId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  })
}
