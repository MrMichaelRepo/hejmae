// Helcim implementation of PaymentProvider.
//
// Onboarding is "manual" — Helcim has no Connect-style hosted flow, so the
// designer signs up at helcim.com, gets approved, and pastes their API
// token + account id into the credential form (see
// /api/settings/payment-processors/helcim). The token is stored encrypted
// in payment_processor_secrets via lib/payments/secrets.ts; this provider
// fetches it on each call.
//
// Payment flow:
//   1. initInvoicePayment → POST /helcim-pay/initialize → returns a
//      checkoutToken. We hand that to the portal, which mounts HelcimPay.js
//      to render the payment iframe.
//   2. Customer pays. HelcimPay.js fires a postMessage event the portal
//      forwards as a navigation to ?paid=1.
//   3. Helcim posts a webhook to /api/webhooks/helcim. The handler verifies
//      the signature, looks up the invoice by invoiceNumber, and marks paid.
//   4. The transactionId from the webhook is what processor_charge_id stores
//      so refunds can route to /payment/refund cleanly.
//
// NEEDS SANDBOX VERIFICATION: the REST shapes here mirror Helcim's v2 API
// docs as of writing but have not been exercised against a live merchant.
// Validate end-to-end in their sandbox before exposing real payment volume.

import type {
  InitPaymentOpts,
  InitPaymentResult,
  OnboardingResult,
  PaymentProvider,
  ProcessorAccount,
  RefundOpts,
  RefundResult,
} from '@/lib/payments/types'
import { getProcessorSecret } from '@/lib/payments/secrets'
import {
  initializeHelcimPay,
  refundHelcimTransaction,
  HelcimApiError,
} from '@/lib/payments/helcim-client'

export class HelcimNotConfiguredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HelcimNotConfiguredError'
  }
}

async function loadApiToken(account: ProcessorAccount): Promise<string> {
  const token = await getProcessorSecret(account.id, 'api_token')
  if (!token) {
    throw new HelcimNotConfiguredError(
      'Helcim API token is not configured for this studio. Re-enter credentials in Settings → Payments.',
    )
  }
  return token
}

function dollars(cents: number): number {
  // Helcim's REST API takes decimal dollars (e.g. 100.00), not cents.
  return Math.round(cents) / 100
}

export const helcimProvider: PaymentProvider = {
  name: 'helcim',

  async initOnboarding(): Promise<OnboardingResult> {
    return {
      kind: 'manual',
      instructions:
        'Sign up at helcim.com (1–2 business day approval). Then paste ' +
        'your API token and account id below — hejmae will route card ' +
        'payments to your Helcim merchant account.',
    }
  },

  async initInvoicePayment(opts: InitPaymentOpts): Promise<InitPaymentResult> {
    const apiToken = await loadApiToken(opts.account)
    try {
      const res = await initializeHelcimPay(apiToken, {
        paymentType: 'purchase',
        amount: dollars(opts.totalCents),
        currency: 'USD',
        // We use the invoice id as the correlation key — the webhook reads
        // it back to find the right invoice without leaking it to the URL.
        invoiceNumber: opts.invoiceId,
        customerEmail: opts.customerEmail ?? undefined,
      })
      return {
        processor: 'helcim',
        externalAccountId: opts.account.externalAccountId,
        // The checkoutToken is what the portal's HelcimPay.js call needs.
        // It's not the eventual transactionId — that arrives via webhook
        // once the customer completes the modal. We overwrite
        // processor_payment_id with the transactionId at webhook time.
        paymentRef: res.checkoutToken,
        clientToken: res.checkoutToken,
      }
    } catch (err) {
      if (err instanceof HelcimApiError) {
        throw new Error(
          `Helcim initialize failed (${err.status}): ${describeHelcimError(err.body)}`,
        )
      }
      throw err
    }
  },

  async refund(opts: RefundOpts): Promise<RefundResult> {
    const apiToken = await loadApiToken(opts.account)
    try {
      const res = await refundHelcimTransaction(apiToken, {
        originalTransactionId: opts.chargeId,
        amount: dollars(opts.amountCents ?? 0),
      })
      return {
        id: String(res.transactionId),
        status: res.status,
      }
    } catch (err) {
      if (err instanceof HelcimApiError) {
        throw new Error(
          `Helcim refund failed (${err.status}): ${describeHelcimError(err.body)}`,
        )
      }
      throw err
    }
  },
}

function describeHelcimError(body: unknown): string {
  if (!body) return 'no error body'
  if (typeof body === 'string') return body
  if (typeof body === 'object' && body !== null) {
    const b = body as Record<string, unknown>
    if (typeof b.message === 'string') return b.message
    if (typeof b.error === 'string') return b.error
    if (Array.isArray(b.errors)) return b.errors.map((e) => String(e)).join('; ')
  }
  return JSON.stringify(body)
}
