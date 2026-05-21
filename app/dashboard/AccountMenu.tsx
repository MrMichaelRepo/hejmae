'use client'

// Custom avatar + dropdown replacement for Clerk's <UserButton/>. Clerk's
// UserButton always re-appends its default "Manage account" item when you
// don't pass it explicitly as a reorder token, which produced two Manage
// account buttons. Building the popover ourselves gives us full control
// over what appears and how navigation behaves.

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useUser, useClerk } from '@clerk/nextjs'

export default function AccountMenu() {
  const router = useRouter()
  const pathname = usePathname()
  const { user, isLoaded } = useUser()
  const { signOut } = useClerk()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const openAccount = () => {
    setOpen(false)
    if (pathname === '/dashboard/settings') {
      if (window.location.hash === '#account') {
        // Hash already set; fire hashchange manually so SettingsClient
        // re-runs its smooth-scroll handler.
        window.dispatchEvent(new HashChangeEvent('hashchange'))
      } else {
        window.location.hash = 'account'
      }
    } else {
      // Coming from a different page: navigate to settings *without* the
      // hash so we land at the top of the page, then SettingsClient picks
      // up this flag, pauses a beat so the user sees the top, and runs
      // the slow scroll down to #account. Avoids the clunky mid-page jump
      // the browser would otherwise do for hash navigation.
      try {
        sessionStorage.setItem('hejmae:scroll-to-account', '1')
      } catch {
        // sessionStorage can throw in privacy-restricted contexts; ignore.
      }
      router.push('/dashboard/settings')
    }
  }

  const doSignOut = async () => {
    setOpen(false)
    await signOut({ redirectUrl: '/' })
  }

  const initial = (
    user?.firstName?.[0] ||
    user?.primaryEmailAddress?.emailAddress?.[0] ||
    '?'
  ).toUpperCase()
  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
    user?.primaryEmailAddress?.emailAddress ||
    'Account'
  const email = user?.primaryEmailAddress?.emailAddress ?? ''

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="w-9 h-9 rounded-full overflow-hidden border border-line bg-bg-elevated hover:border-line-strong transition-colors focus-visible:outline-none focus-visible:shadow-focus"
      >
        {isLoaded && user?.hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.imageUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center font-garamond text-[0.95rem] text-ink-muted">
            {initial}
          </div>
        )}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 min-w-[260px] bg-bg-elevated border border-line rounded-lg shadow-elev2 z-50 overflow-hidden animate-sheet-in"
        >
          {/* User info header */}
          <div className="px-4 py-3 flex items-center gap-3 border-b border-line">
            <div className="w-9 h-9 rounded-full overflow-hidden border border-line bg-bg shrink-0">
              {user?.hasImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.imageUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-garamond text-[0.95rem] text-ink-muted">
                  {initial}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="font-garamond text-[0.95rem] text-ink truncate">
                {displayName}
              </div>
              {email ? (
                <div className="font-garamond text-[0.85rem] text-ink-muted truncate">
                  {email}
                </div>
              ) : null}
            </div>
          </div>

          {/* Items */}
          <div className="py-1.5">
            <MenuItem icon={<SettingsIcon />} onClick={openAccount}>
              Manage account
            </MenuItem>
            <MenuItem icon={<SignOutIcon />} onClick={doSignOut}>
              Sign out
            </MenuItem>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function MenuItem({
  icon,
  onClick,
  children,
}: {
  icon: React.ReactNode
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 font-sans text-[11px] uppercase tracking-[0.2em] text-ink-muted hover:text-ink hover:bg-ink/[0.04] transition-colors"
    >
      <span className="text-ink-subtle">{icon}</span>
      <span>{children}</span>
    </button>
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

function SignOutIcon() {
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
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}
