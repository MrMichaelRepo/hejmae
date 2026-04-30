import { currentUser } from '@clerk/nextjs/server'
import { UserButton } from '@clerk/nextjs'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import DashboardNav from './DashboardNav'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await currentUser()
  if (!user) redirect('/sign-in')

  const studioName =
    user.firstName ? `${user.firstName}'s studio` : 'Your studio'

  return (
    <div className="min-h-screen flex">
      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-hm-text/10 px-6 py-8">
        <Link
          href="/"
          className="font-sans text-[13px] font-bold uppercase tracking-[0.22em] text-hm-text mb-12"
        >
          hejmae
        </Link>

        <DashboardNav />

        <div className="mt-auto pt-8 font-sans text-[10px] uppercase tracking-[0.2em] text-hm-nav/50">
          Studio &middot; Beta
        </div>
      </aside>

      {/* ── Right column ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-hm-text/10 px-6 md:px-10 flex items-center justify-between">
          <div className="font-garamond text-[1rem] text-hm-nav truncate">
            {studioName}
          </div>
          <UserButton />
        </header>

        <main className="flex-1 px-6 md:px-10 py-10">{children}</main>
      </div>
    </div>
  )
}
