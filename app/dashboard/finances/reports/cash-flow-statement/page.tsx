import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { buildCashFlowStatement } from '@/lib/finances/cash_flow_statement'
import { formatCents, formatDate } from '@/lib/format'
import { PageHeader } from '@/components/ui/EmptyState'

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const dateRe = /^\d{4}-\d{2}-\d{2}$/

export default async function CashFlowStatementPage({ searchParams }: Props) {
  const ctx = await requireDesigner()
  requirePermission(ctx, 'finances:view')
  const sp = await searchParams
  const today = new Date().toISOString().slice(0, 10)
  const ytdStart = today.slice(0, 4) + '-01-01'
  const fromRaw = typeof sp.from === 'string' ? sp.from : undefined
  const toRaw = typeof sp.to === 'string' ? sp.to : undefined
  const from = fromRaw && dateRe.test(fromRaw) ? fromRaw : ytdStart
  const to = toRaw && dateRe.test(toRaw) ? toRaw : today
  const stmt = await buildCashFlowStatement(ctx.designerId, from, to)

  return (
    <div>
      <PageHeader
        eyebrow="Reports"
        title="Statement of cash flows"
        subtitle={`Indirect method, from ${formatDate(stmt.from)} through ${formatDate(stmt.to)}. Starts with net income and adjusts for non-cash changes in working capital.`}
      />

      <form className="mb-6 flex items-end gap-3" method="get">
        <label className="font-garamond text-[0.9rem]">
          <span className="block font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-1">
            From
          </span>
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="border border-hm-text/20 px-3 py-2 bg-bg"
          />
        </label>
        <label className="font-garamond text-[0.9rem]">
          <span className="block font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-1">
            To
          </span>
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="border border-hm-text/20 px-3 py-2 bg-bg"
          />
        </label>
        <button
          type="submit"
          className="font-sans text-[10px] uppercase tracking-[0.22em] border border-hm-text/25 px-4 py-2 hover:bg-hm-text hover:text-bg transition-colors"
        >
          Apply
        </button>
      </form>

      <Section section={stmt.operating} />
      <Section section={stmt.investing} />
      <Section section={stmt.financing} />

      <div className="mt-8 border border-hm-text/30 p-6">
        <Row label="Net change in cash" value={stmt.net_change_cents} bold />
        <Row label="Opening cash" value={stmt.opening_cash_cents} />
        <Row label="Closing cash" value={stmt.closing_cash_cents} bold />
        <div className="mt-3 font-garamond text-[0.9rem] text-hm-nav">
          {stmt.reconciled
            ? 'Statement reconciles ✓'
            : `Out of balance by ${formatCents(
                stmt.closing_cash_cents -
                  (stmt.opening_cash_cents + stmt.net_change_cents),
              )} — investigate via the trial balance.`}
        </div>
      </div>
    </div>
  )
}

function Section({
  section,
}: {
  section: {
    title: string
    net_cents: number
    lines: Array<{ account_id: string | null; label: string; amount_cents: number }>
  }
}) {
  return (
    <section className="mb-6">
      <h2 className="font-serif text-[1.2rem] leading-tight mb-3">
        {section.title}
      </h2>
      <div className="border border-hm-text/10">
        {section.lines.length === 0 ? (
          <div className="px-4 py-3 font-garamond text-hm-nav italic text-[0.92rem]">
            No activity.
          </div>
        ) : (
          <table className="w-full font-garamond text-[0.95rem]">
            <tbody>
              {section.lines.map((l, i) => (
                <tr
                  key={l.account_id ?? i}
                  className={i > 0 ? 'border-t border-hm-text/5' : ''}
                >
                  <td className="px-4 py-2">{l.label}</td>
                  <td className="text-right px-4 py-2 w-40">
                    {formatCents(l.amount_cents)}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-hm-text/30 font-sans text-[10px] uppercase tracking-[0.18em]">
                <td className="px-4 py-2">Net {section.title.toLowerCase()}</td>
                <td className="text-right px-4 py-2">
                  {formatCents(section.net_cents)}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

function Row({
  label,
  value,
  bold,
}: {
  label: string
  value: number
  bold?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between py-1">
      <div className={bold ? 'font-serif text-[1.05rem]' : 'font-garamond'}>
        {label}
      </div>
      <div className={bold ? 'font-serif text-[1.2rem]' : 'font-garamond'}>
        {formatCents(value)}
      </div>
    </div>
  )
}
