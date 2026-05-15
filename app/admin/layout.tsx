import { currentUser } from '@clerk/nextjs/server'
import { ClerkProvider, UserButton } from '@clerk/nextjs'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { requireDesigner } from '@/lib/auth/designer'

const clerkAppearance = {
  variables: {
    colorPrimary: '#1e2128',
    colorText: '#1e2128',
    colorTextSecondary: '#4a5068',
    borderRadius: '0.375rem',
  },
}

const ADMIN_NAV: Array<[string, string]> = [
  ['Duplicates', '/admin/duplicates'],
  ['Catalog', '/admin/catalog'],
]

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const clerkUser = await currentUser()
  if (!clerkUser) redirect('/sign-in')

  // Server-side admin gate. Non-admins get a 404 — we deliberately don't
  // surface that an /admin tree exists.
  const ctx = await requireDesigner()
  if (ctx.user.role !== 'admin') {
    notFound()
  }

  return (
    <ClerkProvider afterSignOutUrl="/" appearance={clerkAppearance}>
      <div className="min-h-screen flex">
        <aside className="hidden md:flex print:hidden w-60 shrink-0 flex-col border-r border-hm-text/10 px-6 py-8">
          <Link
            href="/"
            className="font-sans text-[13px] font-bold uppercase tracking-[0.22em] text-hm-text mb-3"
          >
            hejmae
          </Link>
          <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-10">
            Admin
          </div>

          <nav className="flex flex-col gap-px">
            {ADMIN_NAV.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="font-sans text-[11px] uppercase tracking-[0.2em] px-3 py-2.5 rounded-sm text-hm-nav hover:text-hm-text hover:bg-hm-text/[0.04] transition-colors"
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="mt-8 pt-6 border-t border-hm-text/10">
            <Link
              href="/dashboard"
              className="font-sans text-[10px] uppercase tracking-[0.2em] px-3 py-2 rounded-sm text-hm-nav hover:text-hm-text inline-block"
            >
              ← Back to studio
            </Link>
          </div>

          <div className="mt-auto pt-8 font-sans text-[10px] uppercase tracking-[0.2em] text-hm-nav/50">
            Platform tools
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 print:hidden border-b border-hm-text/10 px-4 md:px-10 flex items-center justify-between gap-3">
            <div className="font-garamond text-[1rem] text-hm-nav truncate">
              hejmae admin · {ctx.user.email}
            </div>
            <UserButton />
          </header>
          <main className="flex-1 px-6 md:px-10 py-10">{children}</main>
        </div>
      </div>
    </ClerkProvider>
  )
}
