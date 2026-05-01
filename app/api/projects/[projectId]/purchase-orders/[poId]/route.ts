import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { loadOwnedProject } from '@/lib/auth/ownership'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, notFound, badRequest } from '@/lib/errors'
import { logActivity } from '@/lib/activity'

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
    const { designerId } = await requireDesigner()
    await loadOwnedProject(designerId, projectId)
    const po = await loadPo(designerId, projectId, poId)
    return NextResponse.json({ data: po })
  })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId, poId } = await params
    const { designerId } = await requireDesigner()
    await loadOwnedProject(designerId, projectId)
    await loadPo(designerId, projectId, poId)

    const body = (await req.json()) as {
      action?: 'send' | 'mark_acknowledged' | 'mark_received' | 'mark_complete'
      pdf_url?: string | null
      expected_lead_time_days?: number | null
      notes?: string | null
    }
    const updates: Record<string, unknown> = {}
    if (body.pdf_url !== undefined) updates.pdf_url = body.pdf_url
    if (body.expected_lead_time_days !== undefined)
      updates.expected_lead_time_days = body.expected_lead_time_days
    if (body.notes !== undefined) updates.notes = body.notes

    switch (body.action) {
      case 'send':
        updates.status = 'sent'
        updates.sent_at = new Date().toISOString()
        break
      case 'mark_acknowledged':
        updates.status = 'acknowledged'
        break
      case 'mark_received':
        updates.status = 'partially_received'
        break
      case 'mark_complete':
        updates.status = 'complete'
        break
      case undefined:
        break
      default:
        throw badRequest('Unknown action')
    }

    const { data, error } = await supabaseAdmin()
      .from('purchase_orders')
      .update(updates)
      .eq('id', poId)
      .eq('designer_id', designerId)
      .select()
      .single()
    if (error) throw error

    if (body.action === 'send') {
      // TODO: send vendor email via Resend.
      await logActivity({
        designerId,
        projectId,
        actorType: 'designer',
        actorId: designerId,
        eventType: 'po.sent',
        description: `PO sent to ${data.vendor_name}`,
        metadata: { po_id: poId },
      })
    }

    return NextResponse.json({ data })
  })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId, poId } = await params
    const { designerId } = await requireDesigner()
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
