'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/ui/EmptyState'
import { PageSpinner } from '@/components/ui/Spinner'
import Button from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Input'
import { toast } from '@/components/ui/Toast'
import type { DesignerUser, PricingMode } from '@/lib/types-ui'

export default function SettingsPage() {
  const [user, setUser] = useState<DesignerUser | null>(null)
  const [saving, setSaving] = useState(false)
  const [stripeLoading, setStripeLoading] = useState(false)

  useEffect(() => {
    api.get<DesignerUser>('/api/settings').then((r) => {
      setUser((r.data as DesignerUser) ?? null)
    })
  }, [])

  const update = (patch: Partial<DesignerUser>) => {
    setUser((u) => (u ? { ...u, ...patch } : u))
  }

  const save = async () => {
    if (!user) return
    setSaving(true)
    try {
      await api.patch('/api/settings', {
        name: user.name,
        studio_name: user.studio_name,
        logo_url: user.logo_url,
        brand_color: user.brand_color,
        pricing_mode: user.pricing_mode,
        default_markup_percent: Number(user.default_markup_percent),
      })
      toast.success('Settings saved')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const connectStripe = async () => {
    setStripeLoading(true)
    try {
      const res = await api.post<{ onboarding_url: string }>('/api/settings/stripe-connect')
      const url = (res as { onboarding_url?: string }).onboarding_url
      if (url) window.location.href = url
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setStripeLoading(false)
    }
  }

  if (!user) return <PageSpinner />

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

      <div className="flex justify-end mb-12">
        <Button variant="primary" onClick={save} loading={saving}>
          Save settings
        </Button>
      </div>

      <Section title="Payments — Stripe Connect">
        <p className="font-garamond text-[0.95rem] text-hm-nav mb-4">
          hejmae uses Stripe Connect — payments go directly to your own
          Stripe account. We take a 0.1% platform fee on processed volume.
        </p>
        {user.stripe_account_id ? (
          <div className="border border-emerald-700/30 bg-emerald-50/30 p-4 mb-4 font-garamond text-[0.95rem] text-emerald-900">
            Stripe account connected: <span className="font-mono">{user.stripe_account_id}</span>
          </div>
        ) : null}
        <Button
          variant={user.stripe_account_id ? 'secondary' : 'primary'}
          onClick={connectStripe}
          loading={stripeLoading}
        >
          {user.stripe_account_id
            ? 'Continue Stripe onboarding'
            : 'Connect Stripe'}
        </Button>
      </Section>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-10">
      <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-4">
        {title}
      </div>
      <div className="border border-hm-text/10 p-6">{children}</div>
    </section>
  )
}
