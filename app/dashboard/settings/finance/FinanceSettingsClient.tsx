'use client'

import { useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { PageHeader } from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Input'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { toast } from '@/components/ui/Toast'
import type { StudioFinanceSettings } from '@/lib/finances/studio_settings'
import type {
  AccountingBasis,
  DefaultInvoiceEmailMode,
} from '@/lib/supabase/types'

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
        default_invoice_email_mode: s.default_invoice_email_mode,
        default_sales_tax_rate_bps: s.default_sales_tax_rate_bps,
        default_sales_tax_state_code: s.default_sales_tax_state_code || null,
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
        <p className="font-garamond text-[0.95rem] text-ink-muted mb-4 leading-[1.6]">
          <span className="text-ink">Cash basis</span> recognizes revenue
          when payments are received. <span className="text-ink">Accrual</span>{' '}
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
        <p className="font-garamond text-[0.95rem] text-ink-muted mb-4 leading-[1.6]">
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

      <Section title="Sales tax">
        <p className="font-garamond text-[0.95rem] text-ink-muted mb-4 leading-[1.6]">
          Default rate and jurisdiction applied to new invoices. Per-line
          taxability and the per-invoice rate are still editable when you
          draft an invoice — this is just the starting point. Leave the rate
          at 0% if you don&rsquo;t collect sales tax.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Default sales tax rate (%)"
            hint="Stored to 2 decimals (basis points). 8.25 → 825 bps."
          >
            <Input
              value={(s.default_sales_tax_rate_bps / 100).toString()}
              onChange={(e) => {
                const v = Number(e.target.value)
                update({
                  default_sales_tax_rate_bps: Number.isFinite(v)
                    ? Math.max(0, Math.min(10_000, Math.round(v * 100)))
                    : 0,
                })
              }}
              inputMode="decimal"
              placeholder="0"
              disabled={!canEdit}
            />
          </Field>
          <Field
            label="Default tax state"
            hint="2-letter US state code. Drives jurisdiction grouping on the sales-tax liability report."
          >
            <Input
              value={s.default_sales_tax_state_code ?? ''}
              onChange={(e) =>
                update({
                  default_sales_tax_state_code: e.target.value
                    .toUpperCase()
                    .slice(0, 2),
                })
              }
              maxLength={2}
              placeholder="CA"
              disabled={!canEdit}
            />
          </Field>
        </div>
      </Section>

      <Section title="Invoice emails">
        <p className="font-garamond text-[0.95rem] text-ink-muted mb-4 leading-[1.6]">
          When you hit Send on an invoice, hejmae pre-fills the email body.
          Choose the default — you can always switch on a per-invoice basis,
          and the ✨ Rewrite-with-AI button is available either way.
        </p>
        <div className="grid grid-cols-1 gap-3">
          <EmailModeOption
            value="template"
            current={s.default_invoice_email_mode}
            title="Template prefill"
            body="Deterministic, fast, no AI call. The same friendly opener every time."
            onPick={(v) => update({ default_invoice_email_mode: v })}
            disabled={!canEdit}
          />
          <EmailModeOption
            value="ai"
            current={s.default_invoice_email_mode}
            title="AI-drafted (Claude Haiku)"
            body="Personalized per invoice from client + project context. Costs one Claude call per Send-modal open."
            onPick={(v) => update({ default_invoice_email_mode: v })}
            disabled={!canEdit}
          />
        </div>
      </Section>

      <Section title="Books close (period locks)">
        <PeriodLockSection canEdit={canEdit} />
      </Section>

      <div className="flex justify-end">
        <Button variant="primary" onClick={save} loading={saving} disabled={!canEdit}>
          {canEdit ? 'Save settings' : 'Read-only'}
        </Button>
      </div>

      {!canEdit ? (
        <p className="mt-4 font-garamond text-[0.9rem] text-ink-subtle">
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
      <span className="absolute right-3 top-1/2 -translate-y-1/2 font-garamond text-[0.9rem] text-ink-muted">
        %
      </span>
    </div>
  )
}

function EmailModeOption({
  value,
  current,
  title,
  body,
  onPick,
  disabled,
}: {
  value: DefaultInvoiceEmailMode
  current: DefaultInvoiceEmailMode
  title: string
  body: string
  onPick: (v: DefaultInvoiceEmailMode) => void
  disabled?: boolean
}) {
  const active = value === current
  return (
    <button
      type="button"
      onClick={() => !disabled && onPick(value)}
      disabled={disabled}
      className={`text-left border px-4 py-3 ${active ? 'border-ink bg-ink/[0.04]' : 'border-line hover:border-line-strong'} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-3 w-3 rounded-full border ${active ? 'border-ink bg-ink' : 'border-line-strong'}`}
        />
        <div className="font-serif text-[1.05rem]">{title}</div>
      </div>
      <div className="mt-1 font-garamond text-[0.9rem] text-ink-muted">{body}</div>
    </button>
  )
}

interface PeriodLockRow {
  id: string
  locked_through_date: string
  locked_at: string
  reason: string | null
}

function PeriodLockSection({ canEdit }: { canEdit: boolean }) {
  const [locks, setLocks] = useState<PeriodLockRow[] | null>(null)
  const [date, setDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  )
  const [reason, setReason] = useState('')
  const [adding, setAdding] = useState(false)
  const confirm = useConfirm()

  const load = async () => {
    try {
      const res = await api.get<PeriodLockRow[]>('/api/finances/period-locks')
      setLocks(((res as { data?: PeriodLockRow[] }).data ?? []) as PeriodLockRow[])
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  useEffect(() => {
    void load()
  }, [])

  const addLock = async () => {
    if (!canEdit) return
    const ok = await confirm({
      title: `Lock entries through ${date}?`,
      body: 'No journal entries on or before this date can be edited or deleted. You can unlock later.',
      confirmLabel: 'Lock period',
    })
    if (!ok) return
    setAdding(true)
    try {
      await api.post('/api/finances/period-locks', {
        locked_through_date: date,
        reason: reason || null,
      })
      toast.success('Period locked')
      setReason('')
      await load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setAdding(false)
    }
  }

  const removeLock = async (id: string) => {
    if (!canEdit) return
    const ok = await confirm({
      title: 'Remove this lock?',
      body: 'Journal entries inside this range will be editable again.',
      confirmLabel: 'Remove lock',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await api.del(`/api/finances/period-locks/${id}`)
      toast.success('Lock removed')
      await load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div>
      <p className="font-garamond text-[0.95rem] text-ink-muted mb-4 leading-[1.6]">
        Lock a fiscal period to prevent edits or deletions of journal entries
        dated on or before the chosen date. Useful at year-end or after
        sending out tax filings. The latest lock wins; remove the row to
        unlock.
      </p>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <Field label="Lock through">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={!canEdit}
          />
        </Field>
        <Field label="Reason (optional)">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. 2025 books closed"
            disabled={!canEdit}
          />
        </Field>
        <Button variant="primary" onClick={addLock} loading={adding} disabled={!canEdit}>
          Lock period
        </Button>
      </div>
      {locks === null ? (
        <div className="font-garamond text-[0.9rem] text-ink-muted">Loading…</div>
      ) : locks.length === 0 ? (
        <div className="font-garamond text-[0.9rem] text-ink-muted italic">
          No locks. All journal entries are editable.
        </div>
      ) : (
        <table className="w-full font-garamond text-[0.92rem]">
          <thead>
            <tr className="font-sans text-[10px] uppercase tracking-[0.18em] text-ink-muted text-left">
              <th className="py-2">Locked through</th>
              <th className="py-2">When</th>
              <th className="py-2">Reason</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {locks.map((l) => (
              <tr key={l.id} className="border-t border-line">
                <td className="py-2">{l.locked_through_date}</td>
                <td className="py-2 text-ink-muted">
                  {new Date(l.locked_at).toLocaleString()}
                </td>
                <td className="py-2 text-ink-muted">{l.reason ?? '—'}</td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={() => removeLock(l.id)}
                    className="font-sans text-[10px] uppercase tracking-[0.18em] underline disabled:opacity-50"
                    disabled={!canEdit}
                  >
                    Unlock
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted mb-4">
        {title}
      </div>
      <div className="border border-line p-6">{children}</div>
    </section>
  )
}

