// Designer-initiated PI creation (e.g. for manual link copy). The portal
// pay endpoint mirrors this for the client side.
import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { loadOwnedProject } from '@/lib/auth/ownership'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, notFound, badRequest } from '@/lib/errors'
import { ensureInvoicePaymentIntent } from '@/lib/stripe/connect'

interface Ctx {
  params: Promise<{ projectId: string; invoiceId: string }>
}

export async function POST(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId, invoiceId } = await params
    const { designerId, user } = await requireDesigner()
    await loadOwnedProject(designerId, projectId)

    if (!user.stripe_account_id) {
      throw badRequest('Connect a Stripe account first')
    }

    const { data: invoice, error } = await supabaseAdmin()
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .eq('designer_id', designerId)
      .eq('project_id', projectId)
      .maybeSingle()
    if (error) throw error
    if (!invoice) throw notFound('Invoice not found')
    if (invoice.status === 'paid') throw badRequest('Invoice already paid')

    const pi = await ensureInvoicePaymentIntent({
      totalCents: invoice.total_cents,
      invoiceId: invoice.id,
      designerId,
      connectedAccountId: user.stripe_account_id,
      existingPaymentIntentId: invoice.stripe_payment_intent_id,
    })

    await supabaseAdmin()
      .from('invoices')
      .update({
        stripe_payment_intent_id: pi.id,
        stripe_account_id: user.stripe_account_id,
      })
      .eq('id', invoiceId)
      .eq('designer_id', designerId)

    return NextResponse.json({
      payment_intent_id: pi.id,
      client_secret: pi.client_secret,
      connected_account_id: user.stripe_account_id,
    })
  })
}
