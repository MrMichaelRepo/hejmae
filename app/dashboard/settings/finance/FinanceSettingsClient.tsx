'use client'

import { useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { PageHeader } from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Input'
import { toast } from '@/components/ui/Toast'
import type { StudioFinanceSettings } from '@/lib/finances/studio_settings'
import type { AccountingBasis } from '@/lib/supabase/types'

const MONTHS = [
  ['1', 'January'],
  ['2', 'February'],
  ['3', 'March'],
  ['4', 'April'],
  ['5', 'May'],
  ['6', 'June'],
  ['7', 'July'],
  ['8', 'August'],
  ['9', 'September'],
  ['10', 'October'],
  ['11', 'November'],
  ['12', 'December'],
] as const

export default function FinanceSettingsClient({
  initial,
  canEdit,
}: {
  initial: StudioFinanceSettings
  canEdit: boolean
}) {
  const [s, setS] = useState<StudioFinanceSettings>(initial)
  const [saving, setSaving] = useState(false)

  const update = (patch: Partial<StudioFinanceSettings>) =>
    setS((cur) => ({ ...cur, ...patch }))

  async function save() {
    setSaving(true)
    try {
      await api.patch('/api/settings/finance', {
        accounting_basis: s.accounting_basis,
        fiscal_year_start_month: s.fiscal_year_start_month,
        estimated_federal_tax_pct: s.estimated_federal_tax_pct,
        estimated_state_tax_pct: s.estimated_state_tax_pct,
        estimated_self_employment_tax_pct: s.estimated_self_employment_tax_pct,
        tax_state_code: s.tax_state_code || null,
      })
      toast.success('Finance settings saved')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        eyebrow="Settings"
        title="Finance & taxes"
        subtitle="Studio-wide bookkeeping policy. Every report defaults to these — individual reports can flip the basis for a one-off view."
      />

      <Section title="Accounting basis">
        <p className="font-garamond text-[0.95rem] text-hm-nav mb-4 leading-[1.6]">
          <span className="text-hm-text">Cash basis</span> recognizes revenue
          when payments are received. <span className="text-hm-text">Accrual</span>{' '}
          recognizes when invoices are sent. Most US sole props file on cash —
          ask your CPA before switching.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Default basis">
            <Select
              value={s.accounting_basis}
              disabled={!canEdit}
              onChange={(e) =>
                update({ accounting_basis: e.target.value as AccountingBasis })
              }
            >
              <option value="cash">Cash</option>
              <option value="accrual">Accrual</option>
            </Select>
          </Field>
          <Field
            label="Fiscal year starts"
            hint="Calendar year studios pick January."
          >
            <Select
              value={String(s.fiscal_year_start_month)}
              disabled={!canEdit}
              onChange={(e) =>
                update({ fiscal_year_start_month: Number(e.target.value) })
              }
            >
              {MONTHS.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Section>

      <Section title="Estimated taxes">
        <p className="font-garamond text-[0.95rem] text-hm-nav mb-4 leading-[1.6]">
          Used to project quarterly estimated payments on the Estimated Taxes
          page. These are estimates only — your CPA should confirm before you
          send anything to the IRS.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Federal income tax %"
            hint="Your projected effective federal rate."
          >
            <PercentInput
              value={s.estimated_federal_tax_pct}
              disabled={!canEdit}
              onChange={(v) => update({ estimated_federal_tax_pct: v })}
            />
          </Field>
          <Field
            label="Self-employment tax %"
            hint="15.3% gross; ~14.13% after the deductible-half adjustment."
          >
            <PercentInput
              value={s.estimated_self_employment_tax_pct}
              disabled={!canEdit}
              onChange={(v) => update({ estimated_self_employment_tax_pct: v })}
            />
          </Field>
          <Field label="State income tax %">
            <PercentInput
              value={s.estimated_state_tax_pct}
              disabled={!canEdit}
              onChange={(v) => update({ estimated_state_tax_pct: v })}
            />
          </Field>
          <Field label="State (2-letter)" hint="e.g. NY, CA, TX">
            <Input
              value={s.tax_state_code ?? ''}
              disabled={!canEdit}
              onChange={(e) =>
                update({
                  tax_state_code: e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z]/g, '')
                    .slice(0, 2) || null,
                })
              }
              maxLength={2}
              placeholder="NY"
            />
          </Field>
        </div>
      </Section>

      <div className="flex justify-end">
        <Button variant="primary" onClick={save} loading={saving} disabled={!canEdit}>
          {canEdit ? 'Save settings' : 'Read-only'}
        </Button>
      </div>

      {!canEdit ? (
        <p className="mt-4 font-garamond text-[0.9rem] text-hm-nav/80">
          Only the studio owner (or an admin with the finance settings
          permission) can change these.
        </p>
      ) : null}
    </div>
  )
}

function PercentInput({
  value,
  onChange,
  disabled,
}: {
  value: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  return (
    <div className="relative">
      <Input
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        max="100"
        value={String(value)}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value)
          onChange(Number.isFinite(n) ? n : 0)
        }}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 font-garamond text-[0.9rem] text-hm-nav">
        %
      </span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-4">
        {title}
      </div>
      <div className="border border-hm-text/10 p-6">{children}</div>
    </section>
  )
}

