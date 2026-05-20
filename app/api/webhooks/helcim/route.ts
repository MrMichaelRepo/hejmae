// Helcim webhook handler.
//
// Verifies the signature against the per-merchant webhook verifier token
// (stored encrypted alongside the API token), looks up the invoice via
// the transaction's invoiceNumber (which we set to invoice.id at init
// time), and marks it paid. Mirrors what handlePaymentIntentSucceeded()
// does in /api/webhooks/stripe-connect.
//
// NEEDS SANDBOX VERIFICATION:
//   * The signature header name & signing scheme below ('webhook-signature'
//     = hex(HMAC_SHA256(verifier, body))) reflect Helcim's documented
//     verification pattern. Exact header casing and whether the body is
//     timestamped need to be confirmed against a live webhook payload.
//   * Webhook payload shape: id, type, data.transactionId. We pull
//     additional fields (amount, invoiceNumber) via GET /card-transactions/{id}
//     to avoid trusting webhook body for money values.

import { NextResponse, type NextRequest } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getProcessorSecret } from '@/lib/payments/secrets'
import { getHelcimTransaction } from '@/lib/payments/helcim-client'
import { logActivity } from '@/lib/activity'
import { trySyncInvoice, trySyncPayment } from '@/lib/qbo/sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface HelcimEventBody {
  id?: string
  type?: string
  data?: {
    transactionId?: number | string
    accountId?: string | number
  }
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  const sigHeader = req.headers.get('webhook-signature')
  if (!sigHeader) {
    return NextResponse.json({ error: 'missing signature' }, { status: 400 })
  }

  let parsed: HelcimEventBody
  try {
    parsed = JSON.parse(raw) as HelcimEventBody
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const accountKey = parsed.data?.accountId
    ? String(parsed.data.accountId)
    : null
  if (!accountKey) {
    console.warn('[helcim webhook] event without data.accountId', parsed)
    return NextResponse.json({ error: 'missing accountId' }, { status: 400 })
  }

  // Find the designer account this webhook belongs to. external_account_id
  // is what the designer pasted during onboarding; Helcim sends the same id
  // in the event payload.
  const sb = supabaseAdmin()
  const { data: account, error: acctErr } = await sb
    .from('payment_processor_accounts')
    .select('id, designer_id, external_account_id')
    .eq('processor', 'helcim')
    .eq('external_account_id', accountKey)
    .maybeSingle()
  if (acctErr) throw acctErr
  if (!account) {
    console.warn('[helcim webhook] no account matches accountId', accountKey)
    return NextResponse.json({ error: 'unknown account' }, { status: 404 })
  }

  // Per-merchant verifier token. Without it, refuse the event — the
  // designer hasn't completed webhook setup yet.
  const verifier = await getProcessorSecret(account.id, 'webhook_verifier')
  if (!verifier) {
    console.warn(
      '[helcim webhook] account has no webhook_verifier configured',
      account.id,
    )
    return NextResponse.json(
      { error: 'webhook verifier not configured' },
      { status: 400 },
    )
  }
  if (!verifySignature(raw, sigHeader, verifier)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 })
  }

  // Idempotency — Helcim retries on non-2xx.
  const eventId = parsed.id ?? `${parsed.type ?? 'unknown'}:${parsed.data?.transactionId ?? Date.now()}`
  const { data: prior } = await sb
    .from('helcim_events')
    .select('id, processed_at')
    .eq('id', eventId)
    .maybeSingle()
  if (prior?.processed_at) {
    return NextResponse.json({ received: true, duplicate: true })
  }
  await sb.from('helcim_events').upsert({
    id: eventId,
    type: parsed.type ?? 'unknown',
    account_id: accountKey,
  })

  try {
    // We pull transaction details from Helcim directly rather than trusting
    // the webhook body for money / status fields.
    const txId = parsed.data?.transactionId
    if (!txId) {
      throw new Error('event missing data.transactionId')
    }
    const apiToken = await getProcessorSecret(account.id, 'api_token')
    if (!apiToken) {
      throw new Error('api token missing for account')
    }
    const tx = await getHelcimTransaction(apiToken, txId)
    await settleInvoiceFromTransaction({
      designerId: account.designer_id,
      transaction: tx,
      externalAccountId: account.external_account_id,
    })
  } catch (err) {
    console.error('[helcim webhook] handler error', err)
    return NextResponse.json({ error: 'handler error' }, { status: 500 })
  }

  await sb
    .from('helcim_events')
    .update({ processed_at: new Date().toISOString() })
    .eq('id', eventId)
  return NextResponse.json({ received: true })
}

function verifySignature(body: string, header: string, verifier: string): boolean {
  // Helcim's documented format is hex-encoded HMAC-SHA256 of the raw body
  // using the per-merchant verifier token as the secret.
  // VERIFY AGAINST DOCS: some Helcim integrations use a `t=<ts>,v1=<sig>`
  // composite header (Stripe-style) — adjust here once confirmed.
  const expected = createHmac('sha256', verifier).update(body).digest('hex')
  const got = header.trim().toLowerCase()
  if (expected.length !== got.length) return false
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(got, 'hex'))
  } catch {
    return false
  }
}

async function settleInvoiceFromTransaction(opts: {
  designerId: string
  transaction: { transactionId: number; status: string; amount: number; invoiceNumber?: string; type: string }
  externalAccountId: string
}) {
  const tx = opts.transaction
  // Only act on captured purchases. Refunds + voids are handled in the
  // refund route + a future event handler.
  if (tx.type !== 'purchase' && tx.type !== 'preauth') return
  if (tx.status !== 'APPROVED' && tx.status !== 'COMPLETED') return

  const invoiceId = tx.invoiceNumber
  if (!invoiceId) {
    console.warn('[helcim webhook] transaction has no invoiceNumber', tx)
    return
  }

  const sb = supabaseAdmin()
  const { data: invoice, error: invErr } = await sb
    .from('invoices')
    .select('id, project_id, total_cents, paid_at, processor_account_id')
    .eq('id', invoiceId)
    .eq('designer_id', opts.designerId)
    .maybeSingle()
  if (invErr) throw invErr
  if (!invoice) {
    console.warn('[helcim webhook] invoice not found', invoiceId)
    return
  }
  if (
    invoice.processor_account_id &&
    invoice.processor_account_id !== opts.externalAccountId
  ) {
    console.warn('[helcim webhook] account mismatch on invoice', {
      invoiceId,
      expected: invoice.processor_account_id,
      got: opts.externalAccountId,
    })
    return
  }

  const amountCents = Math.round(tx.amount * 100)
  const chargeId = String(tx.transactionId)

  // Insert payment idempotently — processor_charge_id is indexed and unique
  // by (processor, processor_charge_id) semantics enforced in the handler.
  const { data: existing } = await sb
    .from('payments')
    .select('id')
    .eq('processor', 'helcim')
    .eq('processor_charge_id', chargeId)
    .maybeSingle()
  let inserted = false
  let insertedPaymentId: string | null = null
  if (!existing) {
    const { data: ins, error: payErr } = await sb
      .from('payments')
      .insert({
        designer_id: opts.designerId,
        invoice_id: invoiceId,
        amount_cents: amountCents,
        stripe_charge_id: null,
        stripe_payment_intent_id: null,
        platform_fee_cents: 0,
        processor: 'helcim',
        processor_charge_id: chargeId,
      })
      .select('id')
      .single()
    if (payErr) throw payErr
    inserted = true
    insertedPaymentId = ins?.id ?? null
  }

  // Stamp the invoice with the real Helcim transaction id so refunds know
  // where to point. (Until the webhook fires, processor_payment_id holds
  // the checkoutToken from init time.)
  await sb
    .from('invoices')
    .update({
      processor: 'helcim',
      processor_payment_id: chargeId,
      processor_account_id: opts.externalAccountId,
    })
    .eq('id', invoiceId)

  // Recompute invoice status from sum of payments.
  const { data: paySum } = await sb
    .from('payments')
    .select('amount_cents')
    .eq('invoice_id', invoiceId)
  const totalPaid = (paySum ?? []).reduce((a, p) => a + p.amount_cents, 0)
  const newStatus =
    totalPaid >= invoice.total_cents ? 'paid' : 'partially_paid'
  await sb
    .from('invoices')
    .update({
      status: newStatus,
      paid_at:
        newStatus === 'paid' ? new Date().toISOString() : invoice.paid_at,
    })
    .eq('id', invoiceId)

  if (inserted) {
    await logActivity({
      designerId: opts.designerId,
      projectId: invoice.project_id,
      actorType: 'client',
      eventType: 'invoice.paid',
      description: `Payment received (Helcim): ${(amountCents / 100).toFixed(2)} USD`,
      metadata: {
        invoice_id: invoiceId,
        helcim_transaction_id: chargeId,
        processor: 'helcim',
      },
    })
    trySyncInvoice(opts.designerId, invoiceId)
    if (insertedPaymentId) trySyncPayment(opts.designerId, insertedPaymentId)
  }
}
