import { currentUser } from '@clerk/nextjs/server'
import { ClerkProvider, UserButton } from '@clerk/nextjs'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { requireDesigner } from '@/lib/auth/designer'
import { ConfirmDialogProvider } from '@/components/ui/ConfirmDialog'
import { clerkAppearance } from '@/lib/clerkAppearance'

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
      <ConfirmDialogProvider>
      <div className="min-h-screen flex">
        <aside className="hidden md:flex print:hidden w-60 shrink-0 flex-col border-r border-line px-6 py-8">
          <Link
            href="/"
            className="font-sans text-[13px] font-bold uppercase tracking-[0.22em] text-ink mb-3"
          >
            hejmae
          </Link>
          <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted mb-10">
            Admin
          </div>

          <nav className="flex flex-col gap-px">
            {ADMIN_NAV.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="font-sans text-[11px] uppercase tracking-[0.2em] px-3 py-2.5 rounded-sm text-ink-muted hover:text-ink hover:bg-ink/[0.04] transition-colors"
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="mt-8 pt-6 border-t border-line">
            <Link
              href="/dashboard"
              className="font-sans text-[10px] uppercase tracking-[0.2em] px-3 py-2 rounded-sm text-ink-muted hover:text-ink inline-block"
            >
              ← Back to studio
            </Link>
          </div>

          <div className="mt-auto pt-8 font-sans text-[10px] uppercase tracking-[0.2em] text-ink-muted/50">
            Platform tools
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 print:hidden border-b border-line px-4 md:px-10 flex items-center justify-between gap-3">
            <div className="font-garamond text-[1rem] text-ink-muted truncate">
              hejmae admin · {ctx.user.email}
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
          <main className="flex-1 px-6 md:px-10 py-10">{children}</main>
        </div>
      </div>
      </ConfirmDialogProvider>
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
