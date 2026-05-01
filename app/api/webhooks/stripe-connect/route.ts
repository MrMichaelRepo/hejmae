// Stripe Connect webhook. Handles events that originate on connected
// designer accounts (PaymentIntent succeeded → mark invoice paid, record
// payment + platform fee; account.updated → reflect onboarding status).
import { NextResponse, type NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { env } from '@/lib/env'
import { logActivity } from '@/lib/activity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature')
  const raw = await req.text()
  if (!sig) {
    return NextResponse.json({ error: 'missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe().webhooks.constructEvent(
      raw,
      sig,
      env.stripeConnectWebhookSecret(),
    )
  } catch (err) {
    console.error('[stripe-connect webhook] signature verification failed', err)
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 })
  }

  const sb = supabaseAdmin()
  // Idempotency
  const { data: prior } = await sb
    .from('stripe_events')
    .select('id, processed_at')
    .eq('id', event.id)
    .maybeSingle()
  if (prior?.processed_at) {
    return NextResponse.json({ received: true, duplicate: true })
  }
  await sb.from('stripe_events').upsert({
    id: event.id,
    type: event.type,
    account_id: event.account ?? null,
    payload: event as unknown as Record<string, unknown>,
  })

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event)
        break
      case 'charge.refunded':
        // TODO: reverse payment + adjust invoice status when a refund
        // happens. Out of scope for v1 scaffold.
        break
      case 'account.updated':
        await handleAccountUpdated(event)
        break
      default:
        break
    }
  } catch (err) {
    console.error('[stripe-connect webhook] handler error', event.type, err)
    return NextResponse.json({ error: 'handler error' }, { status: 500 })
  }

  await sb
    .from('stripe_events')
    .update({ processed_at: new Date().toISOString() })
    .eq('id', event.id)
  return NextResponse.json({ received: true })
}

async function handlePaymentIntentSucceeded(event: Stripe.Event) {
  const pi = event.data.object as Stripe.PaymentIntent
  const invoiceId = pi.metadata?.invoice_id
  const designerId = pi.metadata?.designer_id
  if (!invoiceId || !designerId) {
    console.warn('[stripe-connect] PI without invoice metadata', pi.id)
    return
  }

  const sb = supabaseAdmin()
  // Look up the invoice scoped to this designer to be safe.
  const { data: invoice, error } = await sb
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .eq('designer_id', designerId)
    .maybeSingle()
  if (error) throw error
  if (!invoice) {
    console.warn('[stripe-connect] invoice not found for PI', pi.id)
    return
  }

  // The PI's amount_received is what actually settled. Application fee
  // amount is what the platform collected.
  const amount = pi.amount_received ?? pi.amount
  const platformFee =
    typeof pi.application_fee_amount === 'number' ? pi.application_fee_amount : 0
  const chargeId =
    typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id ?? null

  // Record the payment idempotently — charge id is unique.
  if (chargeId) {
    const { data: existing } = await sb
      .from('payments')
      .select('id')
      .eq('stripe_charge_id', chargeId)
      .maybeSingle()
    if (existing) return
  }

  await sb.from('payments').insert({
    designer_id: designerId,
    invoice_id: invoiceId,
    amount_cents: amount,
    stripe_charge_id: chargeId,
    stripe_payment_intent_id: pi.id,
    platform_fee_cents: platformFee,
  })

  // Recompute invoice status from sum of payments.
  const { data: paySum } = await sb
    .from('payments')
    .select('amount_cents')
    .eq('invoice_id', invoiceId)
  const totalPaid = (paySum ?? []).reduce((a, p) => a + p.amount_cents, 0)
  const newStatus = totalPaid >= invoice.total_cents ? 'paid' : 'partially_paid'
  await sb
    .from('invoices')
    .update({
      status: newStatus,
      paid_at: newStatus === 'paid' ? new Date().toISOString() : invoice.paid_at,
    })
    .eq('id', invoiceId)

  await logActivity({
    designerId,
    projectId: invoice.project_id,
    actorType: 'client',
    eventType: 'invoice.paid',
    description: `Payment received: ${(amount / 100).toFixed(2)} USD`,
    metadata: {
      invoice_id: invoiceId,
      payment_intent_id: pi.id,
      charge_id: chargeId,
      platform_fee_cents: platformFee,
    },
  })
}

async function handleAccountUpdated(event: Stripe.Event) {
  // No-op for now — onboarding state is queryable on demand. TODO: cache
  // charges_enabled / payouts_enabled on users so we can gate UI without
  // a Stripe round-trip.
  void event
}
