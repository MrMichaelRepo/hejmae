// Shared Clerk appearance overrides so every Clerk surface (sign-in, sign-up,
// UserButton popover, UserProfile modal) matches the rest of hejmae.
//
// Hex values mirror the design tokens declared in tailwind.config.ts and
// globals.css. Keep this file as the single source of truth — never inline
// a Clerk style elsewhere.

import type { Appearance } from '@clerk/types'

const palette = {
  bg: '#eae8e0',
  bgElevated: '#f3f1ea',
  surface: '#fbfaf6',
  ink: '#1e2128',
  inkMuted: '#4a5068',
  inkSubtle: '#8a8e9c',
  line: '#d8d4c6',
  lineStrong: '#c5c0ae',
  accent: '#8b3a2e',
  accentHover: '#732f25',
  accentSoft: '#e8d5c8',
  danger: '#8a2e2e',
}

// Inter for chrome, EB Garamond for body — matches font-sans / font-garamond.
const SANS = 'var(--font-inter), system-ui, -apple-system, "Segoe UI", sans-serif'
const SERIF = 'var(--font-eb-garamond), Georgia, "Times New Roman", serif'

export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: palette.ink,
    colorBackground: palette.bg,
    colorText: palette.ink,
    colorTextSecondary: palette.inkMuted,
    colorTextOnPrimaryBackground: palette.bg,
    colorInputBackground: palette.surface,
    colorInputText: palette.ink,
    colorDanger: palette.danger,
    colorNeutral: palette.ink,
    colorShimmer: palette.line,
    borderRadius: '6px',
    fontFamily: SERIF,
    fontFamilyButtons: SANS,
    fontSize: '15px',
  },
  elements: {
    // Hide every "Secured by Clerk" surface anywhere it shows up.
    footer: { display: 'none' },
    footerAction: { display: 'none' },
    logoBox: { display: 'none' },
    badge: { display: 'none' },

    // Cards / popovers — make them look like our own Modal / Drawer.
    card: {
      backgroundColor: palette.bgElevated,
      border: `1px solid ${palette.line}`,
      borderRadius: '12px',
      boxShadow: '0 2px 4px rgba(30,33,40,.06), 0 20px 40px -12px rgba(30,33,40,.12)',
    },
    userButtonPopoverCard: {
      backgroundColor: palette.bgElevated,
      border: `1px solid ${palette.line}`,
      borderRadius: '8px',
      boxShadow: '0 1px 2px rgba(30,33,40,.04), 0 8px 24px -8px rgba(30,33,40,.08)',
    },
    userButtonPopoverFooter: { display: 'none' },
    userButtonPopoverActions: { padding: '6px' },
    userButtonPopoverActionButton: {
      fontFamily: SANS,
      fontSize: '11px',
      letterSpacing: '0.2em',
      textTransform: 'uppercase',
      color: palette.inkMuted,
      padding: '10px 12px',
      borderRadius: '6px',
      '&:hover': { backgroundColor: 'rgba(30,33,40,0.04)', color: palette.ink },
    },
    userButtonPopoverActionButtonIcon: { color: palette.inkSubtle },
    userPreviewMainIdentifier: {
      fontFamily: SERIF,
      fontSize: '15px',
      color: palette.ink,
    },
    userPreviewSecondaryIdentifier: {
      fontFamily: SERIF,
      fontSize: '13px',
      color: palette.inkMuted,
    },

    // Form pieces
    formFieldLabel: {
      fontFamily: SANS,
      fontSize: '10px',
      letterSpacing: '0.22em',
      textTransform: 'uppercase',
      color: palette.inkMuted,
    },
    formFieldInput: {
      backgroundColor: palette.surface,
      border: `1px solid ${palette.line}`,
      borderRadius: '6px',
      fontFamily: SERIF,
      fontSize: '16px',
      color: palette.ink,
      padding: '10px 14px',
      '&:focus': {
        borderColor: palette.accent,
        boxShadow: `0 0 0 2px ${palette.bg}, 0 0 0 4px ${palette.accent}`,
      },
    },
    formButtonPrimary: {
      backgroundColor: palette.ink,
      border: `1px solid ${palette.ink}`,
      color: palette.bg,
      fontFamily: SANS,
      fontSize: '11px',
      letterSpacing: '0.2em',
      textTransform: 'uppercase',
      borderRadius: '9999px',
      padding: '10px 24px',
      '&:hover': { backgroundColor: 'rgba(30,33,40,0.9)' },
    },

    // Headings inside Clerk surfaces (UserProfile etc.)
    headerTitle: {
      fontFamily: SERIF,
      fontSize: '1.4rem',
      color: palette.ink,
    },
    headerSubtitle: { color: palette.inkMuted, fontFamily: SERIF },
  },
}
