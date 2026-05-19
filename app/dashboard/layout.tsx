import { currentUser } from '@clerk/nextjs/server'
import { ClerkProvider, UserButton } from '@clerk/nextjs'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import DashboardNav from './DashboardNav'
import MobileNavTrigger from './MobileNavTrigger'
import { CommandPaletteProvider, CommandPaletteTrigger } from '@/components/ui/CommandPalette'

const clerkAppearance = {
  variables: {
    colorPrimary: '#1e2128',
    colorText: '#1e2128',
    colorTextSecondary: '#4a5068',
    borderRadius: '0.375rem',
  },
}

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
    <ClerkProvider afterSignOutUrl="/" appearance={clerkAppearance}>
      <CommandPaletteProvider>
        <div className="min-h-screen flex">
          {/* ── Sidebar ───────────────────────────────────────────────────────── */}
          <aside className="hidden md:flex print:hidden w-60 shrink-0 flex-col border-r border-line px-6 py-8">
            <Link
              href="/"
              className="font-sans text-[13px] font-bold uppercase tracking-[0.22em] text-ink mb-8"
            >
              hejmae
            </Link>

            <CommandPaletteTrigger className="mb-8" />

            <DashboardNav />

            <div className="mt-auto pt-8 font-sans text-[10px] uppercase tracking-[0.2em] text-ink-subtle">
              Studio &middot; Beta
            </div>
          </aside>

          {/* ── Right column ──────────────────────────────────────────────────── */}
          <div className="flex-1 flex flex-col min-w-0">
            <header className="h-16 print:hidden border-b border-line px-4 md:px-10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <MobileNavTrigger />
                <div className="font-garamond text-[1rem] text-ink-muted truncate">
                  {studioName}
                </div>
              </div>
              <UserButton />
            </header>

            <main className="flex-1 px-6 md:px-10 py-10 print:p-0">{children}</main>
          </div>
        </div>
      </CommandPaletteProvider>
    </ClerkProvider>
  )
}
