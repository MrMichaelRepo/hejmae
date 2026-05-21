import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { buildCashFlowForecast } from '@/lib/finances/cash_flow'
import { formatCents } from '@/lib/format'
import { PageHeader } from '@/components/ui/EmptyState'

export default async function CashFlowPage() {
  const ctx = await requireDesigner()
  requirePermission(ctx, 'finances:view')
  const forecast = await buildCashFlowForecast(ctx.designerId)

  return (
    <div>
      <PageHeader
        eyebrow="Reports"
        title="13-week cash flow"
        subtitle="Rolling forecast of expected inflows and outflows over the next 13 weeks. Estimates assume invoices settle 30 days after sent; POs settle on expected delivery; unpaid expenses settle on expense_date."
      />

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <SummaryCard
          label="Starting balance"
          value={formatCents(forecast.startingBalanceCents)}
        />
        <SummaryCard
          label="Net 13-week"
          value={formatCents(
            forecast.weeks.reduce((a, w) => a + w.netCents, 0),
          )}
        />
        <SummaryCard
          label="Ending balance (wk 13)"
          value={formatCents(
            forecast.weeks[forecast.weeks.length - 1]?.endingBalanceCents ??
              forecast.startingBalanceCents,
          )}
        />
      </div>

      <div className="border border-line overflow-x-auto">
        <table className="w-full font-garamond text-[0.9rem]">
          <thead>
            <tr className="bg-ink/[0.03] font-sans text-[10px] uppercase tracking-[0.18em] text-ink-muted">
              <th className="text-left px-3 py-3 w-32">Week</th>
              <th className="text-right px-3 py-3">In</th>
              <th className="text-right px-3 py-3">Out</th>
              <th className="text-right px-3 py-3">Net</th>
              <th className="text-right px-3 py-3">Ending</th>
              <th className="text-left px-3 py-3">Detail</th>
            </tr>
          </thead>
          <tbody>
            {forecast.weeks.map((w) => {
              const lowBalance = w.endingBalanceCents < 0
              return (
                <tr key={w.weekStart} className="border-t border-line align-top">
                  <td className="px-3 py-3 text-ink-muted whitespace-nowrap">
                    {w.weekStart}
                  </td>
                  <td className="text-right px-3 py-3 text-success">
                    {w.inflowCents > 0 ? formatCents(w.inflowCents) : '—'}
                  </td>
                  <td className="text-right px-3 py-3 text-warn">
                    {w.outflowCents < 0 ? formatCents(w.outflowCents) : '—'}
                  </td>
                  <td className="text-right px-3 py-3">
                    {formatCents(w.netCents)}
                  </td>
                  <td
                    className={`text-right px-3 py-3 ${lowBalance ? 'text-warn font-semibold' : ''}`}
                  >
                    {formatCents(w.endingBalanceCents)}
                  </td>
                  <td className="px-3 py-3">
                    {w.lines.length === 0 ? (
                      <span className="text-ink-muted italic">—</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {w.lines.map((l, i) => (
                          <li key={i} className="flex justify-between gap-3">
                            <span className="text-ink-muted text-[0.85rem]">
                              <span className="font-mono">{l.date}</span>{' '}
                              {l.description}
                            </span>
                            <span
                              className={
                                l.amount_cents >= 0
                                  ? 'text-success whitespace-nowrap'
                                  : 'text-warn whitespace-nowrap'
                              }
                            >
                              {formatCents(l.amount_cents)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-line p-4">
      <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted mb-1">
        {label}
      </div>
      <div className="font-serif text-[1.3rem]">{value}</div>
    </div>
  )
}
