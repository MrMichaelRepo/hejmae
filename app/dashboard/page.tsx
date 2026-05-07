import Link from 'next/link'
import { currentUser } from '@clerk/nextjs/server'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import DashboardOverview, { type ProjectListItem, type FinanceSummary } from './DashboardOverview'

async function loadOverview(): Promise<{
  projects: ProjectListItem[]
  summary: FinanceSummary
}> {
  const { designerId } = await requireDesigner()
  const sb = supabaseAdmin()

  const [projectsRes, invoicesRes, paymentsRes, poLinesRes] = await Promise.all([
    sb
      .from('projects')
      .select('id, name, status, client_id, budget_cents, updated_at')
      .eq('designer_id', designerId)
      .order('created_at', { ascending: false }),
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

  const projects = (projectsRes.data ?? []) as ProjectListItem[]
  const invoices = invoicesRes.data ?? []
  const payments = paymentsRes.data ?? []
  const poLines = poLinesRes.data ?? []

  const totalInvoiced = invoices
    .filter((i) => i.status !== 'draft')
    .reduce((a, i) => a + i.total_cents, 0)
  const totalReceived = payments.reduce((a, p) => a + p.amount_cents, 0)
  const paidByInvoice = new Map<string, number>()
  for (const p of payments) {
    if (!p.invoice_id) continue
    paidByInvoice.set(
      p.invoice_id,
      (paidByInvoice.get(p.invoice_id) ?? 0) + p.amount_cents,
    )
  }
  const totalOutstanding = invoices
    .filter((i) => i.status === 'sent' || i.status === 'partially_paid')
    .reduce(
      (a, i) => a + Math.max(0, i.total_cents - (paidByInvoice.get(i.id) ?? 0)),
      0,
    )
  const totalCogs = poLines.reduce((a, l) => a + l.total_trade_price_cents, 0)
  const grossProfit = totalReceived - totalCogs
  const grossMarginPct =
    totalReceived > 0 ? (grossProfit / totalReceived) * 100 : null

  return {
    projects,
    summary: {
      total_invoiced_cents: totalInvoiced,
      total_received_cents: totalReceived,
      total_outstanding_cents: totalOutstanding,
      total_cogs_cents: totalCogs,
      gross_profit_cents: grossProfit,
      gross_margin_pct: grossMarginPct,
    },
  }
}

export default async function DashboardPage() {
  const [user, overview] = await Promise.all([currentUser(), loadOverview()])
  const firstName = user?.firstName ?? 'there'

  return (
    <div className="max-w-5xl">
      <div className="mb-12">
        <div className="font-sans text-[10px] uppercase tracking-[0.26em] text-hm-nav mb-4">
          Overview
        </div>
        <h1 className="font-serif text-[clamp(1.8rem,3vw,2.6rem)] leading-[1.1] tracking-[-0.015em] mb-3">
          Welcome, {firstName}.
        </h1>
        <p className="font-garamond text-[1rem] leading-[1.7] text-hm-nav max-w-xl">
          A snapshot of your studio. Jump straight to a project, or start a new one.
        </p>
      </div>

      <DashboardOverview
        initialProjects={overview.projects}
        initialSummary={overview.summary}
      />

      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-px" style={{ background: 'rgba(30,33,40,0.1)' }}>
        {[
          {
            title: 'Projects',
            text: 'The container for everything — items, proposals, invoices, POs, floor plans.',
            href: '/dashboard/projects',
          },
          {
            title: 'Catalog',
            text: 'Your library plus the platform-wide master catalog. Reuse what you’ve specified before.',
            href: '/dashboard/catalog',
          },
          {
            title: 'Finances',
            text: 'Studio-wide P&L. Invoiced, received, COGS, margin — across every project.',
            href: '/dashboard/finances',
          },
        ].map(({ title, text, href }) => (
          <Link key={title} href={href} className="bg-bg p-6 hover:bg-hm-text/[0.03] transition-colors group">
            <div className="font-serif text-[1.05rem] mb-2 leading-tight group-hover:text-hm-text">
              {title}
            </div>
            <div className="font-garamond text-[0.9rem] leading-[1.7] text-hm-nav">{text}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
