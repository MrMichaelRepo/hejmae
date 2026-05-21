'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV: Array<[string, string]> = [
  ['Overview', '/dashboard'],
  ['Projects', '/dashboard/projects'],
  ['Time', '/dashboard/time'],
  ['Catalog', '/dashboard/catalog'],
  ['Clippings', '/dashboard/clippings'],
  ['Vendors', '/dashboard/vendors'],
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
              'relative font-sans text-[11px] uppercase tracking-[0.2em] pl-3 pr-3 py-2.5 rounded-sm transition-colors duration-150 ease-out-soft focus-ring',
              active
                ? 'text-ink bg-accent-soft/40 before:content-[""] before:absolute before:left-[-9px] before:top-1.5 before:bottom-1.5 before:w-[2px] before:bg-accent before:rounded-full'
                : 'text-ink-muted hover:text-ink hover:bg-ink/[0.04]',
            ].join(' ')}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
