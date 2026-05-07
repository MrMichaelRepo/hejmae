import Link from 'next/link'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { getStudioSummary, getProjectPL } from '@/lib/finances/rollup'
import { formatCents, formatPercent } from '@/lib/format'
import { PageHeader } from '@/components/ui/EmptyState'
import EmptyState from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'

export default async function FinancesPage() {
  const { designerId, role, permissions } = await requireDesigner()
  requirePermission({ role, permissions }, 'finances:view')

  const [summary, projects] = await Promise.all([
    getStudioSummary(designerId),
    getProjectPL(designerId),
  ])

  return (
    <div>
      <PageHeader
        eyebrow="Finances"
        title="Studio rollup"
        subtitle="A simple, designer-native view of money in and money out across every project."
        actions={
          <a href="/api/finances/export" download>
            <Button variant="secondary">Export CSV</Button>
          </a>
        }
      />

      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-px mb-12"
        style={{ background: 'rgba(30,33,40,0.1)' }}
      >
        {[
          ['Invoiced', formatCents(summary.total_invoiced_cents)],
          ['Received', formatCents(summary.total_received_cents)],
          ['Outstanding', formatCents(summary.total_outstanding_cents)],
          ['COGS', formatCents(summary.total_cogs_cents)],
        ].map(([label, value]) => (
          <div key={label as string} className="bg-bg p-6">
            <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-2">
              {label as string}
            </div>
            <div className="font-serif text-[1.6rem] leading-none">
              {value as string}
            </div>
          </div>
        ))}
      </div>

      <div
        className="grid grid-cols-2 gap-px mb-12"
        style={{ background: 'rgba(30,33,40,0.1)' }}
      >
        <div className="bg-bg p-6">
          <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-2">
            Gross profit
          </div>
          <div className="font-serif text-[1.6rem] leading-none">
            {formatCents(summary.gross_profit_cents)}
          </div>
        </div>
        <div className="bg-bg p-6">
          <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-2">
            Margin
          </div>
          <div className="font-serif text-[1.6rem] leading-none">
            {formatPercent(summary.gross_margin_pct)}
          </div>
        </div>
      </div>

      <h2 className="font-serif text-[1.3rem] leading-tight mb-4">
        By project
      </h2>
      {projects.length === 0 ? (
        <EmptyState
          title="No project data yet"
          body="Create projects, send invoices, and log POs — the rollup will appear here."
          small
        />
      ) : (
        <div className="border border-hm-text/10 overflow-x-auto">
          <table className="w-full font-garamond text-[0.95rem]">
            <thead>
              <tr className="bg-hm-text/[0.03] font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav">
                <th className="text-left px-4 py-3">Project</th>
                <th className="text-right px-4 py-3">Invoiced</th>
                <th className="text-right px-4 py-3">Received</th>
                <th className="text-right px-4 py-3">COGS</th>
                <th className="text-right px-4 py-3">Profit</th>
                <th className="text-right px-4 py-3">Margin</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr
                  key={p.project_id}
                  className="border-t border-hm-text/10 hover:bg-hm-text/[0.02]"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/projects/${p.project_id}`}
                      className="hover:text-hm-text"
                    >
                      {p.project_name}
                    </Link>
                  </td>
                  <td className="text-right px-4 py-3">
                    {formatCents(p.invoiced_cents)}
                  </td>
                  <td className="text-right px-4 py-3">
                    {formatCents(p.received_cents)}
                  </td>
                  <td className="text-right px-4 py-3">
                    {formatCents(p.cogs_cents)}
                  </td>
                  <td className="text-right px-4 py-3">
                    {formatCents(p.gross_profit_cents)}
                  </td>
                  <td className="text-right px-4 py-3">
                    {formatPercent(p.margin_pct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
