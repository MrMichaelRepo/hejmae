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
        await handleChargeRefunded(event)
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
  const eventAccount = event.account ?? null
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
  if (!eventAccount) {
    console.warn('[stripe-connect] missing event.account for PI', {
      event_id: event.id,
      invoice_id: invoiceId,
      payment_intent_id: pi.id,
    })
    return
  }
  if (!invoice.stripe_account_id) {
    console.warn('[stripe-connect] invoice missing stripe_account_id', {
      event_id: event.id,
      invoice_id: invoiceId,
      event_account: eventAccount,
    })
    return
  }
  if (invoice.stripe_account_id !== eventAccount) {
    console.warn('[stripe-connect] account mismatch for PI', {
      event_id: event.id,
      invoice_id: invoiceId,
      invoice_account: invoice.stripe_account_id,
      event_account: eventAccount,
      payment_intent_id: pi.id,
    })
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
  let paymentWasInserted = false
  if (chargeId) {
    const { data: existing } = await sb
      .from('payments')
      .select('id')
      .eq('stripe_charge_id', chargeId)
      .maybeSingle()
    if (!existing) {
      await sb.from('payments').insert({
        designer_id: designerId,
        invoice_id: invoiceId,
        amount_cents: amount,
        stripe_charge_id: chargeId,
        stripe_payment_intent_id: pi.id,
        platform_fee_cents: platformFee,
      })
      paymentWasInserted = true
    }
  } else {
    const { data: existingByPi } = await sb
      .from('payments')
      .select('id')
      .eq('stripe_payment_intent_id', pi.id)
      .maybeSingle()
    if (!existingByPi) {
      await sb.from('payments').insert({
        designer_id: designerId,
        invoice_id: invoiceId,
        amount_cents: amount,
        stripe_charge_id: null,
        stripe_payment_intent_id: pi.id,
        platform_fee_cents: platformFee,
      })
      paymentWasInserted = true
    }
  }

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

  if (paymentWasInserted) {
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
}

async function handleChargeRefunded(event: Stripe.Event) {
  const charge = event.data.object as Stripe.Charge
  const chargeId = charge.id
  const eventAccount = event.account ?? null
  if (!chargeId) return

  const sb = supabaseAdmin()
  const { data: payment, error: payErr } = await sb
    .from('payments')
    .select('id, invoice_id, designer_id, amount_cents')
    .eq('stripe_charge_id', chargeId)
    .maybeSingle()
  if (payErr) throw payErr
  if (!payment) return

  // Keep the payment row aligned to Stripe's net-captured amount after refunds.
  const netCaptured = Math.max(0, charge.amount - charge.amount_refunded)
  const previousAmount = payment.amount_cents
  if (netCaptured === 0) {
    const { error: delErr } = await sb.from('payments').delete().eq('id', payment.id)
    if (delErr) throw delErr
  } else if (netCaptured !== previousAmount) {
    const { error: updErr } = await sb
      .from('payments')
      .update({ amount_cents: netCaptured })
      .eq('id', payment.id)
    if (updErr) throw updErr
  }

  const { data: invoice, error: invErr } = await sb
    .from('invoices')
    .select('id, project_id, total_cents, paid_at')
    .eq('id', payment.invoice_id)
    .eq('designer_id', payment.designer_id)
    .maybeSingle()
  if (invErr) throw invErr
  if (!invoice) return
  if (!eventAccount) {
    console.warn('[stripe-connect] missing event.account for refund', {
      event_id: event.id,
      invoice_id: invoice.id,
      stripe_charge_id: chargeId,
    })
    return
  }
  const { data: invoiceAccountRow, error: invoiceAccountErr } = await sb
    .from('invoices')
    .select('stripe_account_id')
    .eq('id', invoice.id)
    .maybeSingle()
  if (invoiceAccountErr) throw invoiceAccountErr
  if (!invoiceAccountRow?.stripe_account_id) {
    console.warn('[stripe-connect] invoice missing stripe_account_id on refund', {
      event_id: event.id,
      invoice_id: invoice.id,
      event_account: eventAccount,
      stripe_charge_id: chargeId,
    })
    return
  }
  if (invoiceAccountRow.stripe_account_id !== eventAccount) {
    console.warn('[stripe-connect] account mismatch for refund', {
      event_id: event.id,
      invoice_id: invoice.id,
      invoice_account: invoiceAccountRow.stripe_account_id,
      event_account: eventAccount,
      stripe_charge_id: chargeId,
    })
    return
  }

  const { data: paySum, error: sumErr } = await sb
    .from('payments')
    .select('amount_cents')
    .eq('invoice_id', invoice.id)
  if (sumErr) throw sumErr
  const totalPaid = (paySum ?? []).reduce((a, p) => a + p.amount_cents, 0)
  const newStatus =
    totalPaid >= invoice.total_cents
      ? 'paid'
      : totalPaid > 0
        ? 'partially_paid'
        : 'sent'
  const { error: invUpdErr } = await sb
    .from('invoices')
    .update({
      status: newStatus,
      paid_at:
        newStatus === 'paid'
          ? invoice.paid_at ?? new Date().toISOString()
          : null,
    })
    .eq('id', invoice.id)
  if (invUpdErr) throw invUpdErr

  if (netCaptured !== previousAmount) {
    const refundedAmount = Math.max(0, previousAmount - netCaptured)
    await logActivity({
      designerId: payment.designer_id,
      projectId: invoice.project_id,
      actorType: 'client',
      eventType: 'invoice.refunded',
      description: `Refund applied: ${(refundedAmount / 100).toFixed(2)} USD`,
      metadata: {
        invoice_id: invoice.id,
        stripe_charge_id: chargeId,
        refund_event_id: event.id,
        previous_amount_cents: previousAmount,
        net_amount_cents: netCaptured,
      },
    })
  }
}

async function handleAccountUpdated(event: Stripe.Event) {
  // No-op for now — onboarding state is queryable on demand. TODO: cache
  // charges_enabled / payouts_enabled on users so we can gate UI without
  // a Stripe round-trip.
  void event
}
