// Stripe Connect helpers.
//
// Architecture: each designer connects their OWN Stripe account (Connect
// "Standard" or "Express") and is the merchant of record. The platform takes
// a small application fee (0.1% by default — env-configurable). Funds flow
// directly to the designer's Stripe account; the platform never holds money.
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

// Compute the platform application fee. Default = 10 bps (0.1%) per spec.
// Floors at 0 cents. Never returns more than the charge total.
export function applicationFeeCents(totalCents: number): number {
  const bps = env.platformFeeBps()
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
  return stripe().paymentIntents.create(
    {
      amount: opts.totalCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      application_fee_amount: applicationFeeCents(opts.totalCents),
      metadata: {
        invoice_id: opts.invoiceId,
        designer_id: opts.designerId,
      },
      receipt_email: opts.customerEmail ?? undefined,
    },
    { stripeAccount: opts.connectedAccountId },
  )
}
