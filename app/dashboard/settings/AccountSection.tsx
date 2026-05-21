'use client'

// Embeds Clerk's <UserProfile /> inline so account management (name, email,
// password, MFA, sessions, connected accounts) lives inside Studio settings
// rather than in a separate Clerk modal. Appearance overrides cover every
// UserProfile sub-element so the surface reads as part of hejmae and not as
// a third-party widget. CSS-level safety nets in globals.css hide any
// branding Clerk renders outside the appearance API.

import { UserProfile } from '@clerk/nextjs'

// Inter for chrome, EB Garamond for body — matches the rest of the app.
const SANS = 'var(--font-inter), system-ui, -apple-system, sans-serif'
const SERIF = 'var(--font-eb-garamond), Georgia, serif'

// Hex tokens — same as tailwind.config.ts.
const C = {
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
  success: '#5b6e4a',
  danger: '#8a2e2e',
}

const FIELD = {
  backgroundColor: C.surface,
  border: `1px solid ${C.line}`,
  borderRadius: '6px',
  fontFamily: SERIF,
  fontSize: '1rem',
  color: C.ink,
  padding: '10px 14px',
  boxShadow: 'none',
  '&:focus, &:focus-visible': {
    borderColor: C.accent,
    boxShadow: `0 0 0 2px ${C.bg}, 0 0 0 4px ${C.accent}`,
    outline: 'none',
  },
} as const

const PILL_PRIMARY = {
  backgroundColor: C.ink,
  border: `1px solid ${C.ink}`,
  color: C.bg,
  fontFamily: SANS,
  fontSize: '11px',
  fontWeight: '400',
  letterSpacing: '0.2em',
  textTransform: 'uppercase',
  borderRadius: '9999px',
  padding: '10px 24px',
  textShadow: 'none',
  boxShadow: 'none',
  '&:hover': { backgroundColor: 'rgba(30,33,40,0.9)', boxShadow: 'none' },
  '&:focus, &:focus-visible': {
    outline: 'none',
    boxShadow: `0 0 0 2px ${C.bg}, 0 0 0 4px ${C.accent}`,
  },
} as const

const PILL_GHOST = {
  backgroundColor: 'transparent',
  border: '1px solid transparent',
  color: C.inkMuted,
  fontFamily: SANS,
  fontSize: '11px',
  letterSpacing: '0.2em',
  textTransform: 'uppercase',
  borderRadius: '9999px',
  padding: '10px 20px',
  boxShadow: 'none',
  '&:hover': {
    color: C.ink,
    backgroundColor: 'rgba(30,33,40,0.04)',
    boxShadow: 'none',
  },
} as const

const PILL_OUTLINE = {
  backgroundColor: 'transparent',
  border: `1px solid ${C.line}`,
  color: C.ink,
  fontFamily: SANS,
  fontSize: '11px',
  letterSpacing: '0.2em',
  textTransform: 'uppercase',
  borderRadius: '9999px',
  padding: '10px 20px',
  boxShadow: 'none',
  '&:hover': {
    borderColor: C.lineStrong,
    backgroundColor: 'rgba(30,33,40,0.04)',
    boxShadow: 'none',
  },
} as const

export default function AccountSection() {
  return (
    <div className="hm-userprofile -mx-6 -my-6">
      <UserProfile
        routing="hash"
        appearance={{
          variables: {
            colorPrimary: C.ink,
            colorBackground: 'transparent',
            colorText: C.ink,
            colorTextSecondary: C.inkMuted,
            colorInputBackground: C.surface,
            colorInputText: C.ink,
            colorDanger: C.danger,
            colorSuccess: C.success,
            colorNeutral: C.ink,
            colorShimmer: C.line,
            borderRadius: '6px',
            fontFamily: SERIF,
            fontFamilyButtons: SANS,
            fontSize: '15px',
          },
          elements: {
            // ── Frame ─────────────────────────────────────────────────
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

            // ── Left navbar ──────────────────────────────────────────
            navbar: {
              backgroundColor: 'transparent',
              borderRight: `1px solid ${C.line}`,
              padding: '20px 12px',
            },
            navbarButtons: { gap: '2px' },
            navbarButton: {
              fontFamily: SANS,
              fontSize: '11px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: C.inkMuted,
              borderRadius: '6px',
              padding: '10px 12px',
              '&:hover': {
                color: C.ink,
                backgroundColor: 'rgba(30,33,40,0.04)',
              },
            },
            navbarButtonIcon: { color: C.inkSubtle },
            // Some Clerk versions emit `navbarButton__active`, others
            // `navbarButton[data-active]`. Cover both.
            navbarButton__active: {
              color: C.ink,
              backgroundColor: C.accentSoft,
            },
            navbarMobileMenuRow: { display: 'none' },
            navbarMobileMenuButton: { display: 'none' },

            // ── Page area ────────────────────────────────────────────
            page: { padding: '8px 8px 24px' },
            pageScrollBox: { padding: '16px 28px' },
            scrollBox: { backgroundColor: 'transparent' },

            // Suppress Clerk's auto page headers (each section has its
            // own title in profile sections below).
            header: { display: 'none' },
            headerTitle: { display: 'none' },
            headerSubtitle: { display: 'none' },
            headerBackRow: { display: 'none' },

            // ── Profile sections ─────────────────────────────────────
            profileSection: {
              borderBottom: `1px solid ${C.line}`,
              paddingBottom: '24px',
              marginBottom: '24px',
              '&:last-child': { borderBottom: 'none', marginBottom: 0 },
            },
            profileSectionTitle: { borderBottom: 'none', paddingBottom: 0 },
            profileSectionTitleText: {
              fontFamily: SERIF,
              fontSize: '1.2rem',
              fontWeight: '500',
              color: C.ink,
            },
            profileSectionSubtitle: {
              fontFamily: SERIF,
              color: C.inkMuted,
              fontSize: '0.95rem',
              marginBottom: '12px',
            },
            profileSectionContent: {
              fontFamily: SERIF,
              color: C.ink,
              fontSize: '0.95rem',
            },
            profileSectionItem: {
              padding: '10px 0',
              borderTop: `1px solid ${C.line}`,
              '&:first-child': { borderTop: 'none' },
            },
            profileSectionItemList: { gap: 0 },
            profileSectionPrimaryButton: PILL_OUTLINE,

            // ── Buttons ──────────────────────────────────────────────
            formButtonPrimary: PILL_PRIMARY,
            formButtonReset: PILL_GHOST,
            button: {
              fontFamily: SANS,
              fontSize: '11px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
            },
            buttonArrowIcon: { color: 'currentColor' },

            // ── Accordions (Security → password, MFA, etc.) ─────────
            accordionTriggerButton: {
              fontFamily: SERIF,
              fontSize: '0.95rem',
              color: C.ink,
              padding: '14px 16px',
              border: `1px solid ${C.line}`,
              borderRadius: '6px',
              backgroundColor: C.surface,
              boxShadow: 'none',
              '&:hover': { borderColor: C.lineStrong },
            },
            accordionContent: {
              backgroundColor: 'transparent',
              padding: '16px',
              border: `1px solid ${C.line}`,
              borderTop: 'none',
              borderRadius: '0 0 6px 6px',
            },

            // ── Form fields ──────────────────────────────────────────
            formFieldLabel: {
              fontFamily: SANS,
              fontSize: '10px',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: C.inkMuted,
              marginBottom: '6px',
            },
            formFieldInput: FIELD,
            formFieldInputShowPasswordButton: { color: C.inkSubtle },
            formFieldHintText: {
              fontFamily: SERIF,
              fontSize: '0.85rem',
              color: C.inkMuted,
            },
            formFieldErrorText: {
              fontFamily: SANS,
              fontSize: '10px',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: C.danger,
            },
            formFieldSuccessText: {
              fontFamily: SANS,
              fontSize: '10px',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: C.success,
            },

            // OTP code inputs (verification codes)
            otpCodeFieldInput: {
              ...FIELD,
              width: '44px',
              height: '52px',
              fontFamily: SERIF,
              fontSize: '1.4rem',
              textAlign: 'center',
              padding: '0',
            },

            // ── Modals (used for edit-name, change-password, etc.) ──
            modalBackdrop: { backgroundColor: 'rgba(30,33,40,0.3)' },
            modalContent: {
              backgroundColor: C.bgElevated,
              border: `1px solid ${C.line}`,
              borderRadius: '12px',
              boxShadow:
                '0 2px 4px rgba(30,33,40,.06), 0 20px 40px -12px rgba(30,33,40,.12)',
            },

            // ── Menus (kebab actions on email/phone rows) ────────────
            menuButton: { color: C.inkSubtle, '&:hover': { color: C.ink } },
            menuList: {
              backgroundColor: C.bgElevated,
              border: `1px solid ${C.line}`,
              borderRadius: '8px',
              boxShadow:
                '0 1px 2px rgba(30,33,40,.04), 0 8px 24px -8px rgba(30,33,40,.08)',
              padding: '4px',
            },
            menuItem: {
              fontFamily: SANS,
              fontSize: '11px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: C.inkMuted,
              borderRadius: '4px',
              padding: '8px 10px',
              '&:hover': {
                color: C.ink,
                backgroundColor: 'rgba(30,33,40,0.04)',
              },
            },

            // ── Avatar / image ───────────────────────────────────────
            avatarBox: { borderRadius: '50%' },
            avatarImage: { borderRadius: '50%' },
            avatarImageActionsUpload: PILL_OUTLINE,
            avatarImageActionsRemove: { ...PILL_GHOST, color: C.danger },

            // ── Misc dividers / chips ────────────────────────────────
            dividerLine: { backgroundColor: C.line },
            dividerText: {
              fontFamily: SANS,
              fontSize: '10px',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: C.inkSubtle,
            },
            tagInputContainer: {
              backgroundColor: C.surface,
              border: `1px solid ${C.line}`,
              borderRadius: '6px',
            },

            // ── Kill all Clerk branding ──────────────────────────────
            footer: { display: 'none' },
            footerAction: { display: 'none' },
            footerActionLink: { display: 'none' },
            footerActionText: { display: 'none' },
            footerPages: { display: 'none' },
            footerPagesLink: { display: 'none' },
            logoBox: { display: 'none' },
            logoImage: { display: 'none' },
            badge: { display: 'none' },
            userPreviewFooter: { display: 'none' },
            poweredByClerkText: { display: 'none' },
          },
        }}
      />
    </div>
  )
}
