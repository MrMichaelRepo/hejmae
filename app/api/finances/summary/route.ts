// Studio-wide financial summary across all projects.
// Numbers are derived from invoices + payments + PO line items, not stored.
import { NextResponse } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'

export async function GET() {
  return withErrorHandling(async () => {
    const { designerId } = await requireDesigner()
    const sb = supabaseAdmin()

    const [{ data: invoices, error: e1 }, { data: payments, error: e2 }, { data: poLines, error: e3 }] =
      await Promise.all([
        sb
          .from('invoices')
          .select('id, status, total_cents')
          .eq('designer_id', designerId),
        sb
          .from('payments')
          .select('amount_cents')
          .eq('designer_id', designerId),
        sb
          .from('purchase_order_line_items')
          .select('total_trade_price_cents')
          .eq('designer_id', designerId),
      ])
    if (e1) throw e1
    if (e2) throw e2
    if (e3) throw e3

    const totalInvoiced =
      invoices
        ?.filter((i) => i.status !== 'draft')
        .reduce((a, i) => a + i.total_cents, 0) ?? 0
    const totalReceived =
      payments?.reduce((a, p) => a + p.amount_cents, 0) ?? 0
    const totalOutstanding =
      invoices
        ?.filter((i) => i.status === 'sent' || i.status === 'partially_paid')
        .reduce((a, i) => a + i.total_cents, 0) ?? 0
    const totalCogs =
      poLines?.reduce((a, l) => a + l.total_trade_price_cents, 0) ?? 0

    const grossProfit = totalReceived - totalCogs
    const grossMarginPct =
      totalReceived > 0 ? (grossProfit / totalReceived) * 100 : null

    return NextResponse.json({
      data: {
        total_invoiced_cents: totalInvoiced,
        total_received_cents: totalReceived,
        total_outstanding_cents: totalOutstanding,
        total_cogs_cents: totalCogs,
        gross_profit_cents: grossProfit,
        gross_margin_pct: grossMarginPct,
      },
    })
  })
}
