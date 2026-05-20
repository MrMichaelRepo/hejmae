// POST /api/projects/[projectId]/invoices/[invoiceId]/refund
//
// Initiates a Stripe refund on the designer's connected account for a
// payment on this invoice. The inbound `charge.refunded` Stripe Connect
// webhook (app/api/webhooks/stripe-connect/route.ts) reconciles the rest:
//   - updates payments.amount_cents to the net captured amount
//   - the post_payment_to_journal() trigger rebuilds journal lines
//   - logs an activity row
//
// This route writes:
//   - payment_refunds row (audit + idempotency anchor)
//   - invoices.refunded_cents (denormalized cache for fast dashboard math)
// and records an `invoice.refund_initiated` activity log. The webhook
// later adds `invoice.refunded` when the refund completes.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { loadOwnedProject } from '@/lib/auth/ownership'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, badRequest, notFound, serverError } from '@/lib/errors'
import { getProcessorAccount, getProvider } from '@/lib/payments/provider'
import type { ProcessorName } from '@/lib/payments/types'
import { logActivity } from '@/lib/activity'

const schema = z.object({
  amount_cents: z.number().int().min(1),
  reason: z.string().max(500).optional().nullable(),
  // Optional: which specific payment to refund. Defaults to the most
  // recent payment with refundable balance.
  payment_id: z.string().uuid().optional().nullable(),
})

interface Ctx {
  params: Promise<{ projectId: string; invoiceId: string }>
}

export async function POST(req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId, invoiceId } = await params
    const { designerId, role, permissions } = await requireDesigner()
    requirePermission({ role, permissions }, 'finances:record_payments')
    await loadOwnedProject(designerId, projectId)

    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      throw badRequest('Invalid refund payload', parsed.error.flatten().fieldErrors)
    }
    const body = parsed.data

    const sb = supabaseAdmin()
    const { data: invoice, error: invErr } = await sb
      .from('invoices')
      .select(
        'id, status, total_cents, refunded_cents, processor, processor_account_id, stripe_account_id, payments(*)',
      )
      .eq('id', invoiceId)
      .eq('project_id', projectId)
      .eq('designer_id', designerId)
      .maybeSingle()
    if (invErr) throw invErr
    if (!invoice) throw notFound('Invoice not found')

    // Refund routes through whichever processor settled this invoice.
    // Backfill assumed Stripe for legacy rows, so processor is populated.
    const processor = (invoice.processor ?? 'stripe') as ProcessorName
    const externalAccountId =
      invoice.processor_account_id ?? invoice.stripe_account_id ?? null
    if (!externalAccountId) {
      throw badRequest(
        'Invoice has no connected processor account — cannot refund automatically',
      )
    }
    const account = await getProcessorAccount(designerId, processor)
    if (!account) {
      throw badRequest(
        `Designer no longer has a ${processor} account connected — cannot refund automatically`,
      )
    }

    // Pick the target payment. Use the generic processor_charge_id so this
    // works for both Stripe and Helcim payments; fall back to the legacy
    // stripe_charge_id column for any pre-migration row that wasn't backfilled.
    const payments = (invoice.payments ?? []) as Array<{
      id: string
      amount_cents: number
      processor: string | null
      processor_charge_id: string | null
      stripe_charge_id: string | null
      received_at: string
    }>
    const candidates = payments
      .map((p) => ({
        ...p,
        chargeId: p.processor_charge_id ?? p.stripe_charge_id,
      }))
      .filter(
        (p) =>
          p.chargeId != null &&
          p.amount_cents > 0 &&
          (p.processor ?? 'stripe') === processor,
      )
      .sort((a, b) => (a.received_at < b.received_at ? 1 : -1))

    const target = body.payment_id
      ? candidates.find((p) => p.id === body.payment_id)
      : candidates[0]
    if (!target) {
      throw badRequest(
        `No refundable ${processor} payment found on this invoice`,
      )
    }
    if (body.amount_cents > target.amount_cents) {
      throw badRequest(
        `Refund amount (${body.amount_cents}) exceeds refundable balance on payment (${target.amount_cents})`,
      )
    }

    // Initiate the refund through the processor that settled the invoice.
    const provider = getProvider(processor)
    let refund: { id: string; status: string }
    try {
      refund = await provider.refund({
        chargeId: target.stripe_charge_id as string,
        account,
        amountCents: body.amount_cents,
        reason: 'requested_by_customer',
        metadata: {
          invoice_id: invoiceId,
          designer_id: designerId,
          payment_id: target.id,
        },
      })
    } catch (err) {
      console.error(`[refund] ${processor} refund failed`, err)
      throw serverError(
        `${processor === 'stripe' ? 'Stripe' : 'Helcim'} refund failed: ${(err as Error).message}`,
      )
    }

    // Insert the audit row and bump the invoice's cumulative refund cache.
    // For Stripe, the charge.refunded webhook bumps payments.amount_cents
    // (= net captured), which triggers post_payment_to_journal() to rebuild
    // the journal. Helcim has no equivalent webhook on our side yet, so we
    // do the same bump synchronously below.
    //
    // We write the refund id to both processor_refund_id (generic) and
    // stripe_refund_id (legacy, kept for one release so journal exports
    // don't lose the linkage).
    const refundInsert: Record<string, unknown> = {
      designer_id: designerId,
      invoice_id: invoiceId,
      payment_id: target.id,
      amount_cents: body.amount_cents,
      processor_refund_id: refund.id,
      reason: body.reason ?? null,
    }
    if (processor === 'stripe') {
      refundInsert.stripe_refund_id = refund.id
    }
    const { data: refundRow, error: refundErr } = await sb
      .from('payment_refunds')
      .insert(refundInsert)
      .select()
      .single()
    if (refundErr) throw refundErr

    const newRefunded =
      (invoice.refunded_cents as number | null ?? 0) + body.amount_cents
    const { error: updErr } = await sb
      .from('invoices')
      .update({ refunded_cents: newRefunded })
      .eq('id', invoiceId)
      .eq('designer_id', designerId)
    if (updErr) throw updErr

    // Non-Stripe processors: no inbound webhook will reconcile payment net,
    // so do it here. The payments_after_update trigger rebuilds the journal.
    if (processor !== 'stripe') {
      const newAmount = Math.max(0, target.amount_cents - body.amount_cents)
      const { error: payUpdErr } = await sb
        .from('payments')
        .update({ amount_cents: newAmount })
        .eq('id', target.id)
      if (payUpdErr) throw payUpdErr

      const { data: paySum } = await sb
        .from('payments')
        .select('amount_cents')
        .eq('invoice_id', invoiceId)
      const totalPaid = (paySum ?? []).reduce((a, p) => a + p.amount_cents, 0)
      const newStatus =
        totalPaid >= invoice.total_cents
          ? 'paid'
          : totalPaid > 0
            ? 'partially_paid'
            : 'sent'
      await sb
        .from('invoices')
        .update({
          status: newStatus,
          paid_at: newStatus === 'paid' ? new Date().toISOString() : null,
        })
        .eq('id', invoiceId)
        .eq('designer_id', designerId)
    }

    await logActivity({
      designerId,
      projectId,
      actorType: 'designer',
      actorId: designerId,
      eventType: 'invoice.refund_initiated',
      description: `Refund initiated: ${(body.amount_cents / 100).toFixed(2)} USD`,
      metadata: {
        invoice_id: invoiceId,
        payment_id: target.id,
        amount_cents: body.amount_cents,
        processor,
        processor_refund_id: refund.id,
        reason: body.reason ?? null,
      },
    })

    return NextResponse.json({ data: refundRow, stripe_refund_status: refund.status })
  })
}
