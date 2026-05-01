// Platform-level Stripe webhook. Used for events on the platform account
// (e.g. subscription billing for the SaaS plan once added).
//
// Note: Connect events (PaymentIntent on connected accounts, account.updated
// for designer onboarding) come in on a separate endpoint — see
// /api/webhooks/stripe-connect — so we can verify with the right secret.
import { NextResponse, type NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { env } from '@/lib/env'

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
    event = stripe().webhooks.constructEvent(raw, sig, env.stripeWebhookSecret())
  } catch (err) {
    console.error('[stripe webhook] signature verification failed', err)
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 })
  }

  const sb = supabaseAdmin()
  // Idempotency: skip if we've already processed this event.
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
    account_id: null,
    payload: event as unknown as Record<string, unknown>,
  })

  // TODO: handle platform-account events (e.g. subscription billing).
  switch (event.type) {
    default:
      break
  }

  await sb
    .from('stripe_events')
    .update({ processed_at: new Date().toISOString() })
    .eq('id', event.id)
  return NextResponse.json({ received: true })
}
