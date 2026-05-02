'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { formatCents } from '@/lib/format'
import { StatusBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'

interface ProjectListItem {
  id: string
  name: string
  status: string
  client_id: string | null
  budget_cents: number | null
  updated_at: string
}

interface FinanceSummary {
  total_invoiced_cents: number
  total_received_cents: number
  total_outstanding_cents: number
  total_cogs_cents: number
  gross_profit_cents: number
  gross_margin_pct: number | null
}

export default function DashboardOverview() {
  const [projects, setProjects] = useState<ProjectListItem[] | null>(null)
  const [summary, setSummary] = useState<FinanceSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([
      api.get<ProjectListItem[]>('/api/projects'),
      api.get<FinanceSummary>('/api/finances/summary'),
    ])
      .then(([p, s]) => {
        if (!alive) return
        setProjects((p.data as ProjectListItem[]) ?? [])
        setSummary((s.data as FinanceSummary) ?? null)
      })
      .catch((e) => {
        if (!alive) return
        setError(e.message ?? 'Failed to load')
      })
    return () => {
      alive = false
    }
  }, [])

  if (error) {
    return (
      <div className="border border-red-700/30 p-6 font-garamond text-[0.95rem] text-red-900">
        {error}
      </div>
    )
  }

  if (!projects || !summary) return <PageSpinner />

  const active = projects.filter((p) => p.status === 'active')

  return (
    <>
      <div
        className="grid grid-cols-1 sm:grid-cols-3 gap-px mb-12"
        style={{ background: 'rgba(30,33,40,0.1)' }}
      >
        {[
          {
            label: 'Active projects',
            value: active.length.toString(),
            href: '/dashboard/projects',
          },
          {
            label: 'Outstanding',
            value: formatCents(summary.total_outstanding_cents),
            href: '/dashboard/finances',
          },
          {
            label: 'Received YTD',
            value: formatCents(summary.total_received_cents),
            href: '/dashboard/finances',
          },
        ].map(({ label, value, href }) => (
          <Link
            key={label}
            href={href}
            className="bg-bg p-7 hover:bg-hm-text/[0.03] transition-colors"
          >
            <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-3">
              {label}
            </div>
            <div className="font-serif text-[clamp(1.8rem,2.5vw,2.4rem)] leading-none text-hm-text">
              {value}
            </div>
          </Link>
        ))}
      </div>

      <div className="flex items-end justify-between mb-5">
        <div>
          <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-2">
            Recent projects
          </div>
          <h2 className="font-serif text-[1.4rem] leading-tight">In progress</h2>
        </div>
        <Link href="/dashboard/projects">
          <Button variant="ghost" size="sm">
            View all
          </Button>
        </Link>
      </div>

      {active.length === 0 ? (
        <EmptyState
          title="No active projects yet"
          body="Create your first project to begin sourcing items, building proposals, and invoicing clients."
          action={
            <Link href="/dashboard/projects">
              <Button variant="primary">Create first project</Button>
            </Link>
          }
        />
      ) : (
        <div className="border border-hm-text/10">
          {active.slice(0, 5).map((p, i) => (
            <Link
              key={p.id}
              href={`/dashboard/projects/${p.id}`}
              className={[
                'flex items-center justify-between gap-4 px-5 py-4 hover:bg-hm-text/[0.03] transition-colors',
                i > 0 ? 'border-t border-hm-text/10' : '',
              ].join(' ')}
            >
              <div className="font-serif text-[1.05rem] leading-tight">{p.name}</div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="font-garamond text-[0.95rem] text-hm-nav hidden sm:block">
                  {formatCents(p.budget_cents)}
                </span>
                <StatusBadge kind="project" status={p.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
