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
import { refundConnectedCharge } from '@/lib/stripe/connect'
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
      .select('id, status, total_cents, refunded_cents, stripe_account_id, payments(*)')
      .eq('id', invoiceId)
      .eq('project_id', projectId)
      .eq('designer_id', designerId)
      .maybeSingle()
    if (invErr) throw invErr
    if (!invoice) throw notFound('Invoice not found')

    if (!invoice.stripe_account_id) {
      throw badRequest(
        'Invoice has no connected Stripe account — cannot refund automatically',
      )
    }

    // Pick the target payment.
    const payments = (invoice.payments ?? []) as Array<{
      id: string
      amount_cents: number
      stripe_charge_id: string | null
      received_at: string
    }>
    const candidates = payments
      .filter((p) => p.stripe_charge_id != null && p.amount_cents > 0)
      .sort((a, b) => (a.received_at < b.received_at ? 1 : -1))

    const target = body.payment_id
      ? candidates.find((p) => p.id === body.payment_id)
      : candidates[0]
    if (!target) {
      throw badRequest('No refundable Stripe payment found on this invoice')
    }
    if (body.amount_cents > target.amount_cents) {
      throw badRequest(
        `Refund amount (${body.amount_cents}) exceeds refundable balance on payment (${target.amount_cents})`,
      )
    }

    // Initiate the refund on the connected account.
    let refund: Awaited<ReturnType<typeof refundConnectedCharge>>
    try {
      refund = await refundConnectedCharge({
        chargeId: target.stripe_charge_id as string,
        connectedAccountId: invoice.stripe_account_id,
        amountCents: body.amount_cents,
        reason: 'requested_by_customer',
        metadata: {
          invoice_id: invoiceId,
          designer_id: designerId,
          payment_id: target.id,
        },
      })
    } catch (err) {
      console.error('[refund] Stripe refund failed', err)
      throw serverError(`Stripe refund failed: ${(err as Error).message}`)
    }

    // Insert the audit row and bump the invoice's cumulative refund cache.
    // The webhook will also bump payments.amount_cents (= net captured),
    // which triggers post_payment_to_journal() to rebuild the journal.
    const { data: refundRow, error: refundErr } = await sb
      .from('payment_refunds')
      .insert({
        designer_id: designerId,
        invoice_id: invoiceId,
        payment_id: target.id,
        amount_cents: body.amount_cents,
        stripe_refund_id: refund.id,
        reason: body.reason ?? null,
      })
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
        stripe_refund_id: refund.id,
        reason: body.reason ?? null,
      },
    })

    return NextResponse.json({ data: refundRow, stripe_refund_status: refund.status })
  })
}
