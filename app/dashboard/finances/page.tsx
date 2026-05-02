'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { formatCents, formatPercent } from '@/lib/format'
import { PageHeader } from '@/components/ui/EmptyState'
import { PageSpinner } from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'

interface FinanceSummary {
  total_invoiced_cents: number
  total_received_cents: number
  total_outstanding_cents: number
  total_cogs_cents: number
  gross_profit_cents: number
  gross_margin_pct: number | null
}

interface ProjectPL {
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

export default function FinancesPage() {
  const [summary, setSummary] = useState<FinanceSummary | null>(null)
  const [projects, setProjects] = useState<ProjectPL[] | null>(null)

  useEffect(() => {
    Promise.all([
      api.get<FinanceSummary>('/api/finances/summary'),
      api.get<ProjectPL[]>('/api/finances/projects'),
    ]).then(([s, p]) => {
      setSummary(s.data as FinanceSummary)
      setProjects((p.data as ProjectPL[]) ?? [])
    })
  }, [])

  if (!summary || projects === null) return <PageSpinner />

  return (
    <div className="max-w-6xl">
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
