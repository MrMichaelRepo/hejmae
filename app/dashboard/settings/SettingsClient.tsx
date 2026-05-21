'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Input'
import { Checkbox } from '@/components/ui/Checkbox'
import { DensityToggle } from '@/components/ui/Density'
import { toast } from '@/components/ui/Toast'
import type { DesignerUser, PricingMode } from '@/lib/types-ui'
import PaymentProcessorsSection from './PaymentProcessorsSection'
import QuickBooksSection from './QuickBooksSection'
import AccountSection from './AccountSection'

export default function SettingsClient({ initialUser }: { initialUser: DesignerUser }) {
  const [user, setUser] = useState<DesignerUser>(initialUser)
  const [saving, setSaving] = useState(false)
  // Only the owner can edit payment-processor settings — gate on role/email
  // already enforced server-side; the UI mirrors it for clarity.
  const canEditPayments = true

  // Next.js App Router doesn't reliably honor URL hashes on client navigation
  // (and the AccountMenu popup deep-links to `/dashboard/settings#account`),
  // so do our own smooth scroll.
  //
  // Two surfaces above the Account section load async — PaymentProcessorsSection
  // and QuickBooksSection both fetch on mount — which means the #account
  // heading's y-position keeps moving down for ~500-1500ms after this page
  // mounts. If we start scrolling immediately we'll undershoot. Wait for
  // layout to quiet down (no resize for 250ms, or 1800ms max) and then
  // animate.
  useEffect(() => {
    const TARGET = '#account'
    const QUIET_MS = 400
    const MAX_WAIT_MS = 3000

    const doScroll = () => {
      // Pass a function so the easing re-measures the element each frame.
      // Async sections above #account (Payment processors, QuickBooks) can
      // continue to shift the heading down even after our initial settle
      // window. Tracking the live position prevents an undershoot.
      smoothScrollTo(() => {
        const el = document.getElementById('account')
        if (!el) return null
        return el.getBoundingClientRect().top + window.scrollY - 24
      }, 900)
    }

    let cleanupSettle: (() => void) | null = null

    const scheduleScroll = () => {
      if (window.location.hash !== TARGET) return
      // Cancel any in-flight settle handler so re-clicks restart cleanly.
      cleanupSettle?.()

      const startedAt = Date.now()
      let quietTimer: ReturnType<typeof setTimeout> | null = null
      let maxTimer: ReturnType<typeof setTimeout> | null = null
      let done = false

      const finish = () => {
        if (done) return
        done = true
        if (quietTimer) clearTimeout(quietTimer)
        if (maxTimer) clearTimeout(maxTimer)
        ro.disconnect()
        cleanupSettle = null
        doScroll()
      }

      const bumpQuiet = () => {
        if (quietTimer) clearTimeout(quietTimer)
        // If we've been waiting longer than MAX_WAIT_MS, scroll immediately.
        if (Date.now() - startedAt >= MAX_WAIT_MS) {
          finish()
          return
        }
        quietTimer = setTimeout(finish, QUIET_MS)
      }

      const ro = new ResizeObserver(bumpQuiet)
      ro.observe(document.body)
      // Kick off the initial quiet window so we still scroll even when no
      // resize ever fires (everything already painted).
      bumpQuiet()
      maxTimer = setTimeout(finish, MAX_WAIT_MS)

      cleanupSettle = () => {
        done = true
        if (quietTimer) clearTimeout(quietTimer)
        if (maxTimer) clearTimeout(maxTimer)
        ro.disconnect()
      }
    }

    scheduleScroll()
    window.addEventListener('hashchange', scheduleScroll)
    return () => {
      window.removeEventListener('hashchange', scheduleScroll)
      cleanupSettle?.()
    }
  }, [])

  const update = (patch: Partial<DesignerUser>) => {
    setUser((u) => ({ ...u, ...patch }))
  }

  const save = async () => {
    setSaving(true)
    try {
      await api.patch('/api/settings', {
        name: user.name,
        studio_name: user.studio_name,
        logo_url: user.logo_url,
        brand_color: user.brand_color,
        pricing_mode: user.pricing_mode,
        default_markup_percent: Number(user.default_markup_percent),
        default_hourly_rate_cents: user.default_hourly_rate_cents,
        weekly_capacity_minutes: user.weekly_capacity_minutes,
        auto_straighten_floor_plans: user.auto_straighten_floor_plans,
      })
      toast.success('Settings saved')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        eyebrow="Settings"
        title="Studio settings"
        subtitle="Branding, pricing defaults, and payments."
      />

      <Section title="Profile">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Your name">
            <Input
              value={user.name ?? ''}
              onChange={(e) => update({ name: e.target.value })}
            />
          </Field>
          <Field label="Studio name">
            <Input
              value={user.studio_name ?? ''}
              onChange={(e) => update({ studio_name: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Email" hint="Managed by your sign-in provider.">
          <Input value={user.email} disabled readOnly />
        </Field>
      </Section>

      <Section title="Branding">
        <Field
          label="Logo URL"
          hint="Used on proposals, invoices, and the client portal."
        >
          <Input
            value={user.logo_url ?? ''}
            onChange={(e) => update({ logo_url: e.target.value })}
            placeholder="https://…"
          />
        </Field>
        <Field label="Brand color (hex)">
          <Input
            value={user.brand_color ?? ''}
            onChange={(e) => update({ brand_color: e.target.value })}
            placeholder="#1e2128"
          />
        </Field>
      </Section>

      <Section title="Pricing defaults">
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Pricing mode"
            hint="Retail bills clients at the catalog retail price. Cost-plus uses your trade price + markup."
          >
            <Select
              value={user.pricing_mode}
              onChange={(e) =>
                update({ pricing_mode: e.target.value as PricingMode })
              }
            >
              <option value="retail">Retail</option>
              <option value="cost_plus">Cost plus</option>
            </Select>
          </Field>
          <Field label="Default markup %">
            <Input
              value={String(user.default_markup_percent)}
              onChange={(e) =>
                update({
                  default_markup_percent: Number(e.target.value) || 0,
                })
              }
              inputMode="decimal"
            />
          </Field>
        </div>
      </Section>

      <Section title="Time tracking">
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Default hourly rate ($)"
            hint="Used as the default for new time entries. Each entry can override."
          >
            <Input
              value={(user.default_hourly_rate_cents / 100).toString()}
              onChange={(e) => {
                const v = Number(e.target.value)
                update({
                  default_hourly_rate_cents: Number.isFinite(v)
                    ? Math.max(0, Math.round(v * 100))
                    : 0,
                })
              }}
              inputMode="decimal"
              placeholder="0"
            />
          </Field>
          <Field
            label="Weekly capacity (hours)"
            hint="Billable target per week — drives utilization reports."
          >
            <Input
              value={(user.weekly_capacity_minutes / 60).toString()}
              onChange={(e) => {
                const v = Number(e.target.value)
                update({
                  weekly_capacity_minutes: Number.isFinite(v)
                    ? Math.min(168, Math.max(0, Math.round(v * 60)))
                    : 0,
                })
              }}
              inputMode="decimal"
              placeholder="40"
            />
          </Field>
        </div>
      </Section>

      <Section title="Floor plans">
        <Checkbox
          align="start"
          checked={user.auto_straighten_floor_plans}
          onChange={(e) =>
            update({ auto_straighten_floor_plans: e.target.checked })
          }
          label="Auto-crop and straighten on upload"
          hint="Uses a vision model to find the floor plan in the image and deskew it to a clean rectangle. Turn off if your scans are already clean."
        />
      </Section>

      <Section title="Display preferences">
        <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted mb-2">
          Row density
        </div>
        <p className="font-garamond text-[0.9rem] text-ink-muted leading-[1.6] mb-3 max-w-md">
          Controls list and table spacing across the studio. Compact is best
          for large projects; Spacious is easier to scan on a small screen.
        </p>
        <DensityToggle />
      </Section>

      <div className="flex justify-end mb-12">
        <Button variant="primary" onClick={save} loading={saving}>
          Save settings
        </Button>
      </div>

      <Section title="Team">
        <p className="font-garamond text-[0.95rem] text-ink-muted mb-4">
          Invite collaborators and manage their access to projects, finances,
          and purchase orders.
        </p>
        <Link
          href="/dashboard/settings/team"
          className="inline-flex items-center gap-2 font-sans text-[10px] uppercase tracking-[0.2em] text-ink border border-line-strong hover:bg-ink hover:text-bg rounded-full px-6 py-2.5 transition-colors"
        >
          Manage team →
        </Link>
      </Section>

      <Section title="Finance & taxes">
        <p className="font-garamond text-[0.95rem] text-ink-muted mb-4">
          Accounting basis, fiscal year start, and estimated tax rates used
          across every report and the quarterly estimated taxes tracker.
        </p>
        <Link
          href="/dashboard/settings/finance"
          className="inline-flex items-center gap-2 font-sans text-[10px] uppercase tracking-[0.2em] text-ink border border-line-strong hover:bg-ink hover:text-bg rounded-full px-6 py-2.5 transition-colors"
        >
          Finance settings →
        </Link>
      </Section>

      <Section title="Payments">
        <PaymentProcessorsSection canEdit={canEditPayments} />
      </Section>

      <Section title="Accounting">
        <QuickBooksSection canEdit={canEditPayments} />
      </Section>

      <Section id="account" title="Account">
        <AccountSection />
      </Section>
    </div>
  )
}

// Slow, eased scroll so the user can track where the page is taking them.
// Mirrors the easing used on the marketing site nav so the motion feels
// consistent across the app.
//
// `target` is a thunk so we can re-measure each frame. The Account heading
// keeps moving while async sections above it finish loading, and a fixed
// pre-computed target would land short.
function smoothScrollTo(
  target: () => number | null,
  duration: number,
) {
  const startY = window.scrollY
  const initialTarget = target()
  if (initialTarget === null) return
  if (Math.abs(initialTarget - startY) < 4) return
  let startTime: number | null = null
  const step = (ts: number) => {
    if (startTime === null) startTime = ts
    const p = Math.min((ts - startTime) / duration, 1)
    const ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
    // Re-measure live. Falls back to the initial target if the element
    // disappears mid-animation (unlikely but defensive).
    const live = target() ?? initialTarget
    const distance = live - startY
    window.scrollTo(0, startY + distance * ease)
    if (p < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

function Section({
  id,
  title,
  children,
}: {
  id?: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="mb-10 scroll-mt-20">
      <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted mb-4">
        {title}
      </div>
      <div className="border border-line p-6">{children}</div>
    </section>
  )
}
