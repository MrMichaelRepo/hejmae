import { currentUser } from '@clerk/nextjs/server'
import Link from 'next/link'
import DashboardOverview from './DashboardOverview'

export default async function DashboardPage() {
  const user = await currentUser()
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

      <DashboardOverview />

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
