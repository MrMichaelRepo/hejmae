import { currentUser } from '@clerk/nextjs/server'
import Link from 'next/link'

export default async function DashboardPage() {
  const user = await currentUser()
  const firstName = user?.firstName ?? 'there'

  return (
    <div className="max-w-5xl">
      {/* ── Welcome ─────────────────────────────────────────────────────────── */}
      <div className="mb-12">
        <div className="font-sans text-[10px] uppercase tracking-[0.26em] text-hm-nav mb-4">
          Overview
        </div>
        <h1 className="font-serif text-[clamp(1.8rem,3vw,2.6rem)] leading-[1.1] tracking-[-0.015em] mb-4">
          Welcome, {firstName}.
        </h1>
        <p className="font-garamond text-[1rem] leading-[1.8] text-hm-nav max-w-xl">
          This is your studio&apos;s overview. As you create projects, log
          expenses, and track purchases, they&apos;ll surface here.
        </p>
      </div>

      {/* ── At a glance ─────────────────────────────────────────────────────── */}
      <div
        className="grid grid-cols-1 sm:grid-cols-3 gap-px mb-12"
        style={{ background: 'rgba(30,33,40,0.1)' }}
      >
        {[
          { label: 'Active projects', value: '—' },
          { label: 'Outstanding invoices', value: '—' },
          { label: 'Open purchase orders', value: '—' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-bg p-7">
            <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-3">
              {label}
            </div>
            <div className="font-serif text-[clamp(1.8rem,2.5vw,2.4rem)] leading-none text-hm-text">
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Get started ─────────────────────────────────────────────────────── */}
      <div className="border border-hm-text/10 p-8 md:p-10">
        <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-3">
          Get started
        </div>
        <h2 className="font-serif text-[1.4rem] leading-tight mb-3">
          Your studio is empty.
        </h2>
        <p className="font-garamond text-[0.95rem] leading-[1.8] text-hm-nav mb-6 max-w-lg">
          Begin by creating your first project. Once it exists, you can attach
          a client, log time, and start linking purchase orders.
        </p>
        <Link
          href="/dashboard/projects"
          className="inline-block font-sans text-[12px] uppercase tracking-[0.2em] border border-hm-text/25 rounded-full px-7 py-3 text-hm-text hover:bg-hm-text hover:text-bg transition-all duration-300"
        >
          Create first project
        </Link>
      </div>

      {/* ── What&apos;s next (lightweight roadmap teaser) ───────────────────── */}
      <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-px" style={{ background: 'rgba(30,33,40,0.1)' }}>
        {[
          {
            title: 'Projects',
            text: 'Phases, deliverables, and client approvals — designed around how studios actually scope and bill.',
          },
          {
            title: 'Bookkeeping',
            text: 'Studio-aware ledger that understands retainers, deposits, and reimbursable expenses.',
          },
          {
            title: 'Purchases',
            text: 'Specifications, POs, and shipping status linked to the project and the client invoice.',
          },
          {
            title: 'Clients',
            text: 'A single source for contacts, sites, and the documents you’ve sent each one.',
          },
        ].map(({ title, text }) => (
          <div key={title} className="bg-bg p-6">
            <div className="font-serif text-[1.05rem] mb-2 leading-tight">
              {title}
            </div>
            <div className="font-garamond text-[0.9rem] leading-[1.8] text-hm-nav">
              {text}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
