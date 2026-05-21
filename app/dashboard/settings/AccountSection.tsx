'use client'

// Embeds Clerk's <UserProfile /> inline so account management (name, email,
// password, MFA, sessions, connected accounts) lives inside Studio settings
// rather than in a separate Clerk modal. Appearance overrides flatten Clerk's
// own card chrome so it sits cleanly inside the Section wrapper used by the
// rest of the settings page.

import { UserProfile } from '@clerk/nextjs'

export default function AccountSection() {
  return (
    <div className="hm-userprofile -mx-6 -my-6">
      <UserProfile
        routing="hash"
        appearance={{
          elements: {
            // Make Clerk's wrapper transparent so the surrounding Section
            // border is the only frame the user sees.
            rootBox: { width: '100%' },
            cardBox: {
              width: '100%',
              maxWidth: '100%',
              boxShadow: 'none',
              border: 'none',
              backgroundColor: 'transparent',
            },
            card: {
              backgroundColor: 'transparent',
              border: 'none',
              boxShadow: 'none',
              padding: '0',
            },
            navbar: {
              backgroundColor: 'transparent',
              borderRight: '1px solid #d8d4c6',
              padding: '16px 12px',
            },
            navbarButton: {
              fontFamily: 'var(--font-inter), system-ui, sans-serif',
              fontSize: '11px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: '#4a5068',
              borderRadius: '4px',
              padding: '10px 12px',
              '&:hover': {
                color: '#1e2128',
                backgroundColor: 'rgba(30,33,40,0.04)',
              },
            },
            navbarButtonIcon: { color: '#8a8e9c' },
            navbarButton__active: {
              color: '#1e2128',
              backgroundColor: '#e8d5c8',
            },
            pageScrollBox: { padding: '24px 28px' },
            scrollBox: { backgroundColor: 'transparent' },
            profileSection: {
              borderBottom: '1px solid #d8d4c6',
              paddingBottom: '24px',
              marginBottom: '24px',
              '&:last-child': { borderBottom: 'none', marginBottom: 0 },
            },
            profileSectionTitle: {
              borderBottom: 'none',
              paddingBottom: 0,
            },
            profileSectionTitleText: {
              fontFamily: 'var(--font-eb-garamond), Georgia, serif',
              fontSize: '1.2rem',
              color: '#1e2128',
            },
            profileSectionContent: {
              fontFamily: 'var(--font-eb-garamond), Georgia, serif',
              color: '#1e2128',
            },
            accordionTriggerButton: {
              fontFamily: 'var(--font-eb-garamond), Georgia, serif',
              fontSize: '0.95rem',
              color: '#1e2128',
              padding: '12px 14px',
              border: '1px solid #d8d4c6',
              borderRadius: '6px',
              backgroundColor: '#fbfaf6',
              '&:hover': { borderColor: '#c5c0ae' },
            },
            badge: { display: 'none' },
            footer: { display: 'none' },
            footerAction: { display: 'none' },
            logoBox: { display: 'none' },
            headerTitle: { display: 'none' },
            headerSubtitle: { display: 'none' },
          },
        }}
      />
    </div>
  )
}
