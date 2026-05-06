// Per-project P&L rollup.
import { NextResponse } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'

export async function GET() {
  return withErrorHandling(async () => {
    const { designerId, role, permissions } = await requireDesigner()
    requirePermission({ role, permissions }, 'finances:view')
    const sb = supabaseAdmin()

    const { data: projects, error } = await sb
      .from('projects')
      .select('id, name, status, client_id')
      .eq('designer_id', designerId)
    if (error) throw error
    if (!projects?.length) return NextResponse.json({ data: [] })

    const projectIds = projects.map((p) => p.id)

    const [{ data: invoices }, { data: payments }, { data: poLines }] = await Promise.all([
      sb
        .from('invoices')
        .select('project_id, status, total_cents')
        .eq('designer_id', designerId)
        .in('project_id', projectIds),
      sb
        .from('payments')
        .select('amount_cents, invoice_id, invoices!inner(project_id)')
        .eq('designer_id', designerId),
      sb
        .from('purchase_order_line_items')
        .select('total_trade_price_cents, purchase_orders!inner(project_id)')
        .eq('designer_id', designerId),
    ])

    const out = projects.map((p) => {
      const invs = (invoices ?? []).filter((i) => i.project_id === p.id)
      const invoiced = invs.filter((i) => i.status !== 'draft').reduce((a, i) => a + i.total_cents, 0)
      const received =
        (payments ?? [])
          .filter((row: { invoices: { project_id: string } | { project_id: string }[] | null }) => {
            const rel = Array.isArray(row.invoices) ? row.invoices[0] : row.invoices
            return rel?.project_id === p.id
          })
          .reduce((a: number, p2: { amount_cents: number }) => a + p2.amount_cents, 0)
      const cogs =
        (poLines ?? [])
          .filter((row: { purchase_orders: { project_id: string } | { project_id: string }[] | null }) => {
            const rel = Array.isArray(row.purchase_orders) ? row.purchase_orders[0] : row.purchase_orders
            return rel?.project_id === p.id
          })
          .reduce((a: number, l: { total_trade_price_cents: number }) => a + l.total_trade_price_cents, 0)
      const grossProfit = received - cogs
      const margin = received > 0 ? (grossProfit / received) * 100 : null
      return {
        project_id: p.id,
        project_name: p.name,
        status: p.status,
        client_id: p.client_id,
        invoiced_cents: invoiced,
        received_cents: received,
        cogs_cents: cogs,
        gross_profit_cents: grossProfit,
        margin_pct: margin,
      }
    })

    return NextResponse.json({ data: out })
  })
}
