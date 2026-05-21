import { currentUser } from '@clerk/nextjs/server'
import { ClerkProvider, UserButton } from '@clerk/nextjs'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import DashboardNav from './DashboardNav'
import MobileNavTrigger from './MobileNavTrigger'
import { CommandPaletteProvider, CommandPaletteTrigger } from '@/components/ui/CommandPalette'
import { ConfirmDialogProvider } from '@/components/ui/ConfirmDialog'
import { DensityProvider } from '@/components/ui/Density'
import { clerkAppearance } from '@/lib/clerkAppearance'

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
      <DensityProvider>
      <ConfirmDialogProvider>
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
              <UserButton
                afterSignOutUrl="/"
                showName={false}
              >
                <UserButton.MenuItems>
                  <UserButton.Link
                    label="Studio settings"
                    labelIcon={<SettingsIcon />}
                    href="/dashboard/settings"
                  />
                  <UserButton.Action label="signOut" />
                </UserButton.MenuItems>
              </UserButton>
            </header>

            <main className="flex-1 px-6 md:px-10 py-10 print:p-0">{children}</main>
          </div>
        </div>
      </CommandPaletteProvider>
      </ConfirmDialogProvider>
      </DensityProvider>
    </ClerkProvider>
  )
}

function SettingsIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}
