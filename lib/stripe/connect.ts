// Stripe Connect helpers.
//
// Architecture: each designer connects their OWN Stripe account (Connect
// "Standard" or "Express") and is the merchant of record. Funds flow
// directly to the designer's Stripe account; the platform never holds money
// and (by default) does not take an application fee — hejmae is priced as
// a flat-subscription SaaS. The platformFeeBps env var is the escape hatch
// if that ever changes.
//
// We use "direct charges" — the PaymentIntent is created on the connected
// account using `stripeAccount`. This keeps the platform out of the
// regulatory perimeter.

import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe/server'
import { env } from '@/lib/env'

export async function createConnectAccount(opts: {
  email: string
  designerId: string
}): Promise<Stripe.Account> {
  return stripe().accounts.create({
    type: 'express',
    email: opts.email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_type: 'individual',
    metadata: { designer_id: opts.designerId },
  })
}

export async function createOnboardingLink(opts: {
  accountId: string
  returnPath?: string
  refreshPath?: string
}): Promise<Stripe.AccountLink> {
  const base = env.appUrl()
  return stripe().accountLinks.create({
    account: opts.accountId,
    type: 'account_onboarding',
    refresh_url: `${base}${opts.refreshPath ?? '/settings/stripe?refresh=1'}`,
    return_url: `${base}${opts.returnPath ?? '/settings/stripe?ok=1'}`,
  })
}

// Refund a charge on the designer's connected account. Partial refunds are
// supported via `amountCents`; omit to refund the full remaining amount.
// The platform application fee is refunded proportionally by default —
// `refundApplicationFee=false` keeps the fee on the platform side.
export async function refundConnectedCharge(opts: {
  chargeId: string
  connectedAccountId: string
  amountCents?: number
  reason?: string
  refundApplicationFee?: boolean
  metadata?: Record<string, string>
}): Promise<Stripe.Refund> {
  const params: Stripe.RefundCreateParams = {
    charge: opts.chargeId,
    refund_application_fee: opts.refundApplicationFee ?? true,
    metadata: opts.metadata ?? {},
  }
  if (typeof opts.amountCents === 'number') {
    params.amount = opts.amountCents
  }
  if (opts.reason && ['duplicate', 'fraudulent', 'requested_by_customer'].includes(opts.reason)) {
    params.reason = opts.reason as Stripe.RefundCreateParams.Reason
  }
  return stripe().refunds.create(params, {
    stripeAccount: opts.connectedAccountId,
  })
}

// Compute the platform application fee. Defaults to 0 bps — hejmae does
// not take a cut of designer payment volume. Floors at 0 cents, never
// exceeds the charge total.
export function applicationFeeCents(totalCents: number): number {
  const bps = env.platformFeeBps()
  if (bps <= 0) return 0
  const fee = Math.floor((totalCents * bps) / 10_000)
  return Math.max(0, Math.min(fee, totalCents))
}

// Create a PaymentIntent on the designer's connected account (direct charge).
// The PaymentIntent is what the client portal will confirm with Stripe.js.
export async function createInvoicePaymentIntent(opts: {
  totalCents: number
  invoiceId: string
  designerId: string
  connectedAccountId: string
  customerEmail?: string | null
}): Promise<Stripe.PaymentIntent> {
  const fee = applicationFeeCents(opts.totalCents)
  const params: Stripe.PaymentIntentCreateParams = {
    amount: opts.totalCents,
    currency: 'usd',
    automatic_payment_methods: { enabled: true },
    metadata: {
      invoice_id: opts.invoiceId,
      designer_id: opts.designerId,
    },
    receipt_email: opts.customerEmail ?? undefined,
  }
  if (fee > 0) params.application_fee_amount = fee
  return stripe().paymentIntents.create(params, {
    stripeAccount: opts.connectedAccountId,
  })
}

// Reuse an existing PaymentIntent when possible so repeated calls don't create
// multiple live intents for a single invoice.
export async function ensureInvoicePaymentIntent(opts: {
  totalCents: number
  invoiceId: string
  designerId: string
  connectedAccountId: string
  existingPaymentIntentId?: string | null
  customerEmail?: string | null
}): Promise<Stripe.PaymentIntent> {
  const s = stripe()
  if (opts.existingPaymentIntentId) {
    try {
      const existing = await s.paymentIntents.retrieve(
        opts.existingPaymentIntentId,
        {},
        { stripeAccount: opts.connectedAccountId },
      )
      // Do not create a new intent once payment is already in flight/succeeded.
      if (
        existing.status === 'processing' ||
        existing.status === 'requires_capture' ||
        existing.status === 'succeeded'
      ) {
        return existing
      }
      if (existing.status !== 'canceled') {
        const fee = applicationFeeCents(opts.totalCents)
        const update: Stripe.PaymentIntentUpdateParams = {
          amount: opts.totalCents,
          currency: 'usd',
          metadata: {
            invoice_id: opts.invoiceId,
            designer_id: opts.designerId,
          },
          receipt_email: opts.customerEmail ?? undefined,
        }
        if (fee > 0) update.application_fee_amount = fee
        return s.paymentIntents.update(existing.id, update, {
          stripeAccount: opts.connectedAccountId,
        })
      }
    } catch {
      // Fall through to create when the stored PI id is stale/invalid.
    }
  }
  return createInvoicePaymentIntent(opts)
}
