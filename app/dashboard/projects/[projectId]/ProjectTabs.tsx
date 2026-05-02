'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS: Array<[string, string]> = [
  ['Overview', ''],
  ['Items', '/items'],
  ['Floor Plan', '/floor-plan'],
  ['Proposal', '/proposal'],
  ['Invoices', '/invoices'],
  ['Purchase Orders', '/purchase-orders'],
  ['Activity', '/activity'],
]

export default function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname()
  const base = `/dashboard/projects/${projectId}`

  return (
    <div className="border-b border-hm-text/10 mb-8 -mx-6 md:-mx-10 px-6 md:px-10">
      <nav className="flex gap-6 overflow-x-auto">
        {TABS.map(([label, sub]) => {
          const href = base + sub
          const active = sub === '' ? pathname === base : pathname === href
          return (
            <Link
              key={label}
              href={href}
              className={[
                'shrink-0 font-sans text-[10px] uppercase tracking-[0.22em] py-4 border-b-2 transition-colors',
                active
                  ? 'text-hm-text border-hm-text'
                  : 'text-hm-nav hover:text-hm-text border-transparent',
              ].join(' ')}
            >
              {label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
