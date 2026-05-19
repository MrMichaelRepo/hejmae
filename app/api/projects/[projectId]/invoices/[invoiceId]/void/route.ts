// POST /api/projects/[projectId]/invoices/[invoiceId]/void
//
// Marks an unpaid invoice as void. Steps:
//   1. Reject if status is 'paid' or 'void', or any payment has captured
//      money (use /refund first).
//   2. Set status='void', voided_at, void_reason; revoke the magic link.
//   3. Activity log.
//
// We don't post a journal entry here. The current bookkeeping model only
// posts on `payment` rows (not invoice sends — there's no AR), so voiding
// an unpaid invoice has no ledger impact.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { loadOwnedProject } from '@/lib/auth/ownership'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, badRequest, notFound } from '@/lib/errors'
import { logActivity } from '@/lib/activity'

const schema = z.object({
  reason: z.string().min(1).max(1_000),
})

interface Ctx {
  params: Promise<{ projectId: string; invoiceId: string }>
}

export async function POST(req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId, invoiceId } = await params
    const { designerId, role, permissions } = await requireDesigner()
    requirePermission({ role, permissions }, 'finances:manage_invoices')
    await loadOwnedProject(designerId, projectId)

    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      throw badRequest('Invalid void payload', parsed.error.flatten().fieldErrors)
    }
    const { reason } = parsed.data

    const sb = supabaseAdmin()
    const { data: invoice, error: invErr } = await sb
      .from('invoices')
      .select('id, status, refunded_cents, payments(amount_cents)')
      .eq('id', invoiceId)
      .eq('project_id', projectId)
      .eq('designer_id', designerId)
      .maybeSingle()
    if (invErr) throw invErr
    if (!invoice) throw notFound('Invoice not found')

    if (invoice.status === 'void') {
      throw badRequest('Invoice is already void')
    }
    if (invoice.status === 'paid') {
      throw badRequest('Cannot void a paid invoice — issue a refund instead')
    }

    const capturedNet = ((invoice.payments ?? []) as Array<{ amount_cents: number }>)
      .reduce((a, p) => a + p.amount_cents, 0)
    if (capturedNet > 0) {
      throw badRequest(
        'This invoice has captured payments. Refund them first, then void.',
      )
    }

    const now = new Date().toISOString()
    const { data, error } = await sb
      .from('invoices')
      .update({
        status: 'void',
        voided_at: now,
        void_reason: reason,
        magic_link_revoked_at: now,
      })
      .eq('id', invoiceId)
      .eq('designer_id', designerId)
      .select('id, status, voided_at, void_reason')
      .single()
    if (error) throw error

    await logActivity({
      designerId,
      projectId,
      actorType: 'designer',
      actorId: designerId,
      eventType: 'invoice.voided',
      description: 'Invoice voided',
      metadata: { invoice_id: invoiceId, reason },
    })

    return NextResponse.json({ data })
  })
}
