// Client portal: create / refresh the Stripe PaymentIntent so the client
// can complete payment via Stripe.js.
//
// The PaymentIntent lives on the designer's connected account. We return
// the `client_secret` and the `connected_account_id` — the FE must
// initialize Stripe.js with `stripeAccount: connected_account_id`.
import { NextResponse, type NextRequest } from 'next/server'
import { loadInvoiceByToken } from '@/lib/portal/auth'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, badRequest } from '@/lib/errors'
import { ensureInvoicePaymentIntent } from '@/lib/stripe/connect'

interface Ctx {
  params: Promise<{ token: string }>
}

export async function POST(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { token } = await params
    const { invoice } = await loadInvoiceByToken(token)
    if (invoice.status === 'paid') throw badRequest('Invoice already paid')

    const sb = supabaseAdmin()
    const { data: designer, error } = await sb
      .from('users')
      .select('stripe_account_id')
      .eq('id', invoice.designer_id)
      .maybeSingle()
    if (error) throw error
    if (!designer?.stripe_account_id) {
      throw badRequest('Designer has not finished Stripe onboarding')
    }

    const pi = await ensureInvoicePaymentIntent({
      totalCents: invoice.total_cents,
      invoiceId: invoice.id,
      designerId: invoice.designer_id,
      connectedAccountId: designer.stripe_account_id,
      existingPaymentIntentId: invoice.stripe_payment_intent_id,
    })

    await sb
      .from('invoices')
      .update({
        stripe_payment_intent_id: pi.id,
        stripe_account_id: designer.stripe_account_id,
      })
      .eq('id', invoice.id)

    return NextResponse.json({
      payment_intent_id: pi.id,
      client_secret: pi.client_secret,
      connected_account_id: designer.stripe_account_id,
    })
  })
}
