// Client portal: create / refresh the payment session so the client can
// complete payment via the active processor's SDK.
//
// Routes through lib/payments/provider — the studio's active processor
// (Stripe or Helcim) determines which backend is invoked. The response
// shape is generic; the client uses `processor` to decide which SDK
// (Stripe.js or HelcimPay.js) to mount.
import { NextResponse, type NextRequest } from 'next/server'
import { loadInvoiceByToken } from '@/lib/portal/auth'
import { withErrorHandling, badRequest, tooManyRequests } from '@/lib/errors'
import {
  getActiveProcessor,
  recordInvoicePaymentInit,
} from '@/lib/payments/provider'
import { checkRateLimit, callerIp } from '@/lib/ratelimit'
import { hashToken } from '@/lib/tokens'

interface Ctx {
  params: Promise<{ token: string }>
}

export async function POST(req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { token } = await params
    const [rlIp, rlTok] = await Promise.all([
      checkRateLimit('portalPay', callerIp(req)),
      checkRateLimit('portalToken', hashToken(token)),
    ])
    if (!rlIp.ok || !rlTok.ok) throw tooManyRequests()
    const { invoice } = await loadInvoiceByToken(token)
    if (invoice.status === 'paid') throw badRequest('Invoice already paid')

    const active = await getActiveProcessor(invoice.designer_id)
    if (!active) {
      throw badRequest(
        'Designer has not finished payment processor onboarding',
      )
    }

    // Reuse the in-flight payment ref only if it was issued by the same
    // processor we're about to use; switching processors invalidates it.
    const existingRef =
      invoice.processor === active.provider.name
        ? invoice.processor_payment_id ?? null
        : null

    const result = await active.provider.initInvoicePayment({
      invoiceId: invoice.id,
      designerId: invoice.designer_id,
      totalCents: invoice.total_cents,
      account: active.account,
      existingPaymentRef: existingRef,
    })

    await recordInvoicePaymentInit({
      invoiceId: invoice.id,
      designerId: invoice.designer_id,
      processor: result.processor,
      paymentRef: result.paymentRef,
      externalAccountId: result.externalAccountId,
    })

    return NextResponse.json({
      processor: result.processor,
      payment_ref: result.paymentRef,
      client_token: result.clientToken,
      external_account_id: result.externalAccountId,
    })
  })
}
