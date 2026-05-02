'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV: Array<[string, string]> = [
  ['Overview', '/dashboard'],
  ['Projects', '/dashboard/projects'],
  ['Catalog', '/dashboard/catalog'],
  ['Clients', '/dashboard/clients'],
  ['Finances', '/dashboard/finances'],
  ['Settings', '/dashboard/settings'],
]

export default function DashboardNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-px">
      {NAV.map(([label, href]) => {
        const active =
          href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={[
              'font-sans text-[11px] uppercase tracking-[0.2em] px-3 py-2.5 rounded-sm transition-colors',
              active
                ? 'text-hm-text bg-hm-text/[0.06]'
                : 'text-hm-nav hover:text-hm-text hover:bg-hm-text/[0.04]',
            ].join(' ')}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
