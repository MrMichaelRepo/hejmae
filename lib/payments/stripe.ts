// Stripe implementation of PaymentProvider. Wraps the lower-level helpers
// in lib/stripe/connect.ts and conforms them to the generic interface in
// lib/payments/types.ts.
//
// Architecture: direct charges on the designer's Connect account. The
// PaymentIntent lives on the connected account; the client SDK must be
// initialized with `stripeAccount: <connected_account_id>`. We surface that
// id in InitPaymentResult.externalAccountId.

import {
  createConnectAccount,
  createOnboardingLink,
  ensureInvoicePaymentIntent,
  refundConnectedCharge,
} from '@/lib/stripe/connect'
import type {
  InitPaymentOpts,
  InitPaymentResult,
  OnboardingResult,
  PaymentProvider,
  ProcessorAccount,
  RefundOpts,
  RefundResult,
} from '@/lib/payments/types'
import { supabaseAdmin } from '@/lib/supabase/server'

export const stripeProvider: PaymentProvider = {
  name: 'stripe',

  async initOnboarding({ designerId, email }): Promise<OnboardingResult> {
    const sb = supabaseAdmin()
    const { data: existing } = await sb
      .from('payment_processor_accounts')
      .select('external_account_id')
      .eq('designer_id', designerId)
      .eq('processor', 'stripe')
      .maybeSingle()

    let accountId = existing?.external_account_id ?? null
    if (!accountId) {
      const account = await createConnectAccount({ email, designerId })
      accountId = account.id
      await sb.from('payment_processor_accounts').upsert(
        {
          designer_id: designerId,
          processor: 'stripe',
          status: 'pending',
          external_account_id: accountId,
        },
        { onConflict: 'designer_id,processor' },
      )
      // Legacy mirror — drop in a follow-up release.
      await sb
        .from('users')
        .update({ stripe_account_id: accountId })
        .eq('id', designerId)
    }

    const link = await createOnboardingLink({ accountId })
    if (!link.url) {
      throw new Error('Stripe did not return an onboarding URL')
    }
    return { kind: 'redirect', url: link.url }
  },

  async initInvoicePayment(opts: InitPaymentOpts): Promise<InitPaymentResult> {
    const pi = await ensureInvoicePaymentIntent({
      totalCents: opts.totalCents,
      invoiceId: opts.invoiceId,
      designerId: opts.designerId,
      connectedAccountId: opts.account.externalAccountId,
      existingPaymentIntentId: opts.existingPaymentRef ?? null,
      customerEmail: opts.customerEmail ?? null,
    })
    if (!pi.client_secret) {
      throw new Error('Stripe PaymentIntent missing client_secret')
    }
    return {
      processor: 'stripe',
      externalAccountId: opts.account.externalAccountId,
      paymentRef: pi.id,
      clientToken: pi.client_secret,
    }
  },

  async refund(opts: RefundOpts): Promise<RefundResult> {
    const refund = await refundConnectedCharge({
      chargeId: opts.chargeId,
      connectedAccountId: opts.account.externalAccountId,
      amountCents: opts.amountCents,
      reason: opts.reason,
      metadata: opts.metadata,
    })
    return { id: refund.id, status: refund.status ?? 'unknown' }
  },
}

export function isStripeAccount(account: ProcessorAccount): boolean {
  return account.processor === 'stripe'
}
