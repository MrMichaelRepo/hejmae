'use client'

// Client wrapper around <UserButton/> so we can override the "Manage account"
// menu item with a custom onClick. The default UserButton.Link sometimes
// loses the URL hash when Clerk's internal popover navigates, which broke
// the /dashboard/settings#account shortcut. Doing the navigation ourselves
// lets us also fire a smooth scroll when the user is already on the
// settings page.

import { useRouter, usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'

export default function AccountMenu() {
  const router = useRouter()
  const pathname = usePathname()

  const openAccount = () => {
    if (pathname === '/dashboard/settings') {
      // Same page — change the hash so SettingsClient's hashchange listener
      // picks it up and runs the smooth-scroll. We replace=false because we
      // also want the URL to reflect the deep-link.
      if (window.location.hash === '#account') {
        // Hash already set; trigger a scroll manually since hashchange
        // won't fire when the value doesn't change.
        window.dispatchEvent(new HashChangeEvent('hashchange'))
      } else {
        window.location.hash = 'account'
      }
    } else {
      router.push('/dashboard/settings#account')
    }
  }

  return (
    <UserButton afterSignOutUrl="/" showName={false}>
      <UserButton.MenuItems>
        <UserButton.Action
          label="Manage account"
          labelIcon={<SettingsIcon />}
          onClick={openAccount}
        />
        <UserButton.Action label="signOut" />
      </UserButton.MenuItems>
    </UserButton>
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
