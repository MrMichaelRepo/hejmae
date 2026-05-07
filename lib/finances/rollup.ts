// Studio finance rollup helpers. Shared between API routes and server pages
// so the same query/calc logic isn't duplicated.
import { supabaseAdmin } from '@/lib/supabase/server'

export interface FinanceSummary {
  total_invoiced_cents: number
  total_received_cents: number
  total_outstanding_cents: number
  total_cogs_cents: number
  gross_profit_cents: number
  gross_margin_pct: number | null
}

export interface ProjectPL {
  project_id: string
  project_name: string
  status: string
  client_id: string | null
  invoiced_cents: number
  received_cents: number
  cogs_cents: number
  gross_profit_cents: number
  margin_pct: number | null
}

export async function getStudioSummary(designerId: string): Promise<FinanceSummary> {
  const sb = supabaseAdmin()
  const [{ data: invoices }, { data: payments }, { data: poLines }] =
    await Promise.all([
      sb
        .from('invoices')
        .select('id, status, total_cents')
        .eq('designer_id', designerId),
      sb
        .from('payments')
        .select('invoice_id, amount_cents')
        .eq('designer_id', designerId),
      sb
        .from('purchase_order_line_items')
        .select('total_trade_price_cents')
        .eq('designer_id', designerId),
    ])

  const totalInvoiced =
    invoices
      ?.filter((i) => i.status !== 'draft')
      .reduce((a, i) => a + i.total_cents, 0) ?? 0
  const totalReceived =
    payments?.reduce((a, p) => a + p.amount_cents, 0) ?? 0
  const paidByInvoice = new Map<string, number>()
  for (const p of payments ?? []) {
    if (!p.invoice_id) continue
    paidByInvoice.set(
      p.invoice_id,
      (paidByInvoice.get(p.invoice_id) ?? 0) + p.amount_cents,
    )
  }
  const totalOutstanding =
    invoices
      ?.filter((i) => i.status === 'sent' || i.status === 'partially_paid')
      .reduce(
        (a, i) => a + Math.max(0, i.total_cents - (paidByInvoice.get(i.id) ?? 0)),
        0,
      ) ?? 0
  const totalCogs =
    poLines?.reduce((a, l) => a + l.total_trade_price_cents, 0) ?? 0
  const grossProfit = totalReceived - totalCogs
  const grossMarginPct =
    totalReceived > 0 ? (grossProfit / totalReceived) * 100 : null

  return {
    total_invoiced_cents: totalInvoiced,
    total_received_cents: totalReceived,
    total_outstanding_cents: totalOutstanding,
    total_cogs_cents: totalCogs,
    gross_profit_cents: grossProfit,
    gross_margin_pct: grossMarginPct,
  }
}

export async function getProjectPL(designerId: string): Promise<ProjectPL[]> {
  const sb = supabaseAdmin()
  const { data: projects } = await sb
    .from('projects')
    .select('id, name, status, client_id')
    .eq('designer_id', designerId)
  if (!projects?.length) return []
  const projectIds = projects.map((p) => p.id)

  const [{ data: invoices }, { data: payments }, { data: poLines }] =
    await Promise.all([
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

  return projects.map((p) => {
    const invs = (invoices ?? []).filter((i) => i.project_id === p.id)
    const invoiced = invs
      .filter((i) => i.status !== 'draft')
      .reduce((a, i) => a + i.total_cents, 0)
    const received = (payments ?? [])
      .filter((row: { invoices: { project_id: string } | { project_id: string }[] | null }) => {
        const rel = Array.isArray(row.invoices) ? row.invoices[0] : row.invoices
        return rel?.project_id === p.id
      })
      .reduce((a: number, p2: { amount_cents: number }) => a + p2.amount_cents, 0)
    const cogs = (poLines ?? [])
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
}
