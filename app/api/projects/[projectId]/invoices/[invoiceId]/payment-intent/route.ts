// Designer-initiated payment session (e.g. for manual link copy). Mirrors
// the portal route on the server side; routes through whichever processor
// is the studio's active one.
import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { loadOwnedProject } from '@/lib/auth/ownership'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, notFound, badRequest } from '@/lib/errors'
import {
  getActiveProcessor,
  recordInvoicePaymentInit,
} from '@/lib/payments/provider'

interface Ctx {
  params: Promise<{ projectId: string; invoiceId: string }>
}

export async function POST(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId, invoiceId } = await params
    const { designerId, role, permissions } = await requireDesigner()
    requirePermission({ role, permissions }, 'finances:record_payments')
    await loadOwnedProject(designerId, projectId)

    const active = await getActiveProcessor(designerId)
    if (!active) {
      throw badRequest('Connect a payment processor first')
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

    const existingRef =
      invoice.processor === active.provider.name
        ? invoice.processor_payment_id ?? null
        : null

    const result = await active.provider.initInvoicePayment({
      invoiceId: invoice.id,
      designerId,
      totalCents: invoice.total_cents,
      account: active.account,
      existingPaymentRef: existingRef,
    })

    await recordInvoicePaymentInit({
      invoiceId: invoice.id,
      designerId,
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
