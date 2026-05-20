'use client'

// One-time migration wizard: pull historical data from QBO into hejmae.
//
// Order matters. The page enforces it through five sequential sections:
//   1. Accounts (chart of accounts) — needed before invoices/JE post anywhere
//   2. Customers — needed before invoices can be imported
//   3. Vendors
//   4. Open invoices
//   5. Opening trial-balance JE
//
// Each section has a "Preview" button that shows what would happen, then
// an "Apply" button that does it. Apply is owner-only (server-enforced).

import { useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import Button from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { toast } from '@/components/ui/Toast'
import { PageHeader } from '@/components/ui/EmptyState'

type ImportAction = 'create' | 'merge' | 'skip' | 'mapped'

interface AccountPreviewRow {
  qboId: string
  qboName: string
  action: ImportAction
  preview: { name: string; type: string; code: string }
}

interface CustomerPreviewRow {
  qboId: string
  qboName: string
  action: ImportAction
  preview: { name: string; email: string | null }
}

interface VendorPreviewRow {
  qboId: string
  qboName: string
  action: ImportAction
  preview: { name: string }
}

interface InvoicePreviewRow {
  qboId: string
  qboDocNumber: string | null
  qboCustomerName: string
  totalCents: number
  balanceCents: number
  alreadyImported: boolean
  customerMissing: boolean
  txnDate: string
  lineCount: number
}

interface TrialBalancePreviewRow {
  qboAccountId: string
  qboAccountName: string
  debit: number
  credit: number
  hejmaeAccountMapped: boolean
}

interface TrialBalancePreview {
  cutoverDate: string
  rows: TrialBalancePreviewRow[]
  unmappedCount: number
  totalDebit: number
  totalCredit: number
  balanced: boolean
}

interface ResultSummary {
  created?: number
  merged?: number
  alreadyMapped?: number
  skipped?: number
  errors?: Array<{ qboId: string; message: string }>
}

function unwrap<T>(res: unknown): T {
  return ((res as { data?: T })?.data ?? res) as T
}

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function ActionPill({ action }: { action: ImportAction }) {
  const cls =
    action === 'create'
      ? 'text-emerald-700 border-emerald-700/30'
      : action === 'merge'
        ? 'text-blue-700 border-blue-700/30'
        : action === 'mapped'
          ? 'text-hm-nav border-hm-nav/30'
          : 'text-amber-800 border-amber-800/30'
  return (
    <span
      className={`font-sans text-[10px] uppercase tracking-[0.18em] border px-2 py-0.5 ${cls}`}
    >
      {action === 'mapped' ? 'Already linked' : action}
    </span>
  )
}

function ResultBanner({ result }: { result: ResultSummary | null }) {
  if (!result) return null
  const errors = result.errors ?? []
  return (
    <div
      className={`mt-3 p-3 border font-garamond text-[0.9rem] ${errors.length > 0 ? 'border-amber-700/40 bg-amber-50' : 'border-emerald-700/40 bg-emerald-50/40'}`}
    >
      <div>
        {result.created !== undefined && (
          <span className="mr-3">{result.created} created</span>
        )}
        {result.merged !== undefined && (
          <span className="mr-3">{result.merged} merged</span>
        )}
        {result.alreadyMapped !== undefined && (
          <span className="mr-3">{result.alreadyMapped} already linked</span>
        )}
        {result.skipped !== undefined && (
          <span className="mr-3">{result.skipped} skipped</span>
        )}
        {errors.length > 0 && (
          <span className="text-amber-900">{errors.length} error(s)</span>
        )}
      </div>
      {errors.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-amber-900">
          {errors.slice(0, 10).map((e, i) => (
            <li key={i}>
              <span className="font-mono text-[0.8rem]">{e.qboId}</span> —{' '}
              {e.message}
            </li>
          ))}
          {errors.length > 10 && (
            <li>… and {errors.length - 10} more</li>
          )}
        </ul>
      )}
    </div>
  )
}

export default function QboImportClient() {
  // Per-section state
  const [accountsPreview, setAccountsPreview] = useState<AccountPreviewRow[] | null>(null)
  const [accountsBusy, setAccountsBusy] = useState(false)
  const [accountsResult, setAccountsResult] = useState<ResultSummary | null>(null)

  const [customersPreview, setCustomersPreview] = useState<CustomerPreviewRow[] | null>(null)
  const [customersBusy, setCustomersBusy] = useState(false)
  const [customersResult, setCustomersResult] = useState<ResultSummary | null>(null)

  const [vendorsPreview, setVendorsPreview] = useState<VendorPreviewRow[] | null>(null)
  const [vendorsBusy, setVendorsBusy] = useState(false)
  const [vendorsResult, setVendorsResult] = useState<ResultSummary | null>(null)

  const [invoicesPreview, setInvoicesPreview] = useState<InvoicePreviewRow[] | null>(null)
  const [invoicesBusy, setInvoicesBusy] = useState(false)
  const [invoicesResult, setInvoicesResult] = useState<ResultSummary | null>(null)

  const [cutoverDate, setCutoverDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  )
  const [tbPreview, setTbPreview] = useState<TrialBalancePreview | null>(null)
  const [tbBusy, setTbBusy] = useState(false)
  const [tbResult, setTbResult] = useState<{ journalEntryId: string; lineCount: number } | null>(
    null,
  )

  const handlePreview = async <T,>(
    url: string,
    setBusy: (b: boolean) => void,
    setData: (d: T | null) => void,
  ) => {
    setBusy(true)
    try {
      const res = await api.get<T>(url)
      setData(unwrap<T>(res))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleApply = async (
    url: string,
    setBusy: (b: boolean) => void,
    setResult: (r: ResultSummary | null) => void,
  ) => {
    if (!confirm('Apply this import? Existing rows will be merged where names match.')) return
    setBusy(true)
    try {
      const res = await api.post<ResultSummary>(url)
      setResult(unwrap<ResultSummary>(res))
      toast.success('Import applied')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-5xl">
      <PageHeader
        eyebrow="Settings · Accounting · Import"
        title="Import from QuickBooks"
        subtitle="Pull chart of accounts, customers, vendors, open invoices, and your opening balances from QB. Run sections in order — invoices depend on customers, the opening JE depends on the account mapping."
      />

      <div className="mb-6 font-garamond text-[0.95rem]">
        <Link href="/dashboard/settings/qbo" className="underline">
          ← Back to QuickBooks settings
        </Link>
      </div>

      {/* Accounts */}
      <Section title="1. Chart of accounts">
        <p className="font-garamond text-[0.92rem] text-hm-nav mb-4 leading-[1.6]">
          Match-by-name with your existing accounts. New ones are created with
          QB&rsquo;s account number when present (otherwise hejmae picks an
          unused code). Mappings are stored so future syncs target the same QB
          account.
        </p>
        <div className="flex gap-2 mb-3">
          <Button
            variant="secondary"
            onClick={() =>
              handlePreview<AccountPreviewRow[]>(
                '/api/integrations/qbo/import/accounts',
                setAccountsBusy,
                setAccountsPreview,
              )
            }
            loading={accountsBusy && !accountsPreview}
          >
            Preview
          </Button>
          <Button
            variant="primary"
            onClick={() =>
              handleApply(
                '/api/integrations/qbo/import/accounts',
                setAccountsBusy,
                setAccountsResult,
              )
            }
            loading={accountsBusy && !!accountsPreview}
            disabled={!accountsPreview}
          >
            Apply
          </Button>
        </div>
        {accountsPreview && (
          <PreviewTable
            rows={accountsPreview.map((r) => ({
              key: r.qboId,
              cells: [
                r.qboName,
                r.preview.type,
                r.preview.code || '—',
                <ActionPill key="a" action={r.action} />,
              ],
            }))}
            headers={['QuickBooks account', 'Type', 'hejmae code', 'Action']}
          />
        )}
        <ResultBanner result={accountsResult} />
      </Section>

      {/* Customers */}
      <Section title="2. Customers → Clients">
        <p className="font-garamond text-[0.92rem] text-hm-nav mb-4 leading-[1.6]">
          Active QBO customers. Existing hejmae clients matching by name are
          merged (blank fields filled in, never overwritten).
        </p>
        <div className="flex gap-2 mb-3">
          <Button
            variant="secondary"
            onClick={() =>
              handlePreview<CustomerPreviewRow[]>(
                '/api/integrations/qbo/import/customers',
                setCustomersBusy,
                setCustomersPreview,
              )
            }
            loading={customersBusy && !customersPreview}
          >
            Preview
          </Button>
          <Button
            variant="primary"
            onClick={() =>
              handleApply(
                '/api/integrations/qbo/import/customers',
                setCustomersBusy,
                setCustomersResult,
              )
            }
            loading={customersBusy && !!customersPreview}
            disabled={!customersPreview}
          >
            Apply
          </Button>
        </div>
        {customersPreview && (
          <PreviewTable
            rows={customersPreview.map((r) => ({
              key: r.qboId,
              cells: [
                r.preview.name,
                r.preview.email ?? '—',
                <ActionPill key="a" action={r.action} />,
              ],
            }))}
            headers={['Name', 'Email', 'Action']}
          />
        )}
        <ResultBanner result={customersResult} />
      </Section>

      {/* Vendors */}
      <Section title="3. Vendors">
        <p className="font-garamond text-[0.92rem] text-hm-nav mb-4 leading-[1.6]">
          Active QBO vendors. 1099-eligibility, tax-id last-4, and billing
          address are pulled where present.
        </p>
        <div className="flex gap-2 mb-3">
          <Button
            variant="secondary"
            onClick={() =>
              handlePreview<VendorPreviewRow[]>(
                '/api/integrations/qbo/import/vendors',
                setVendorsBusy,
                setVendorsPreview,
              )
            }
            loading={vendorsBusy && !vendorsPreview}
          >
            Preview
          </Button>
          <Button
            variant="primary"
            onClick={() =>
              handleApply(
                '/api/integrations/qbo/import/vendors',
                setVendorsBusy,
                setVendorsResult,
              )
            }
            loading={vendorsBusy && !!vendorsPreview}
            disabled={!vendorsPreview}
          >
            Apply
          </Button>
        </div>
        {vendorsPreview && (
          <PreviewTable
            rows={vendorsPreview.map((r) => ({
              key: r.qboId,
              cells: [r.preview.name, <ActionPill key="a" action={r.action} />],
            }))}
            headers={['Name', 'Action']}
          />
        )}
        <ResultBanner result={vendorsResult} />
      </Section>

      {/* Invoices */}
      <Section title="4. Open invoices (A/R)">
        <p className="font-garamond text-[0.92rem] text-hm-nav mb-4 leading-[1.6]">
          Invoices with a remaining balance in QuickBooks. They land in a
          single &ldquo;QuickBooks import&rdquo; project so they don&rsquo;t
          interfere with your hejmae projects; you can re-home them later.
          Partially-paid invoices come over as <span className="italic">partially_paid</span>{' '}
          with the paid portion stubbed in as a payment.
        </p>
        <p className="font-garamond text-[0.88rem] text-hm-nav mb-4">
          <strong>Bills (A/P)</strong> are not imported — hejmae doesn&rsquo;t
          model bills as a separate entity. Outstanding bills should be
          re-entered as expenses post-cutover.
        </p>
        <div className="flex gap-2 mb-3">
          <Button
            variant="secondary"
            onClick={() =>
              handlePreview<InvoicePreviewRow[]>(
                '/api/integrations/qbo/import/invoices',
                setInvoicesBusy,
                setInvoicesPreview,
              )
            }
            loading={invoicesBusy && !invoicesPreview}
          >
            Preview
          </Button>
          <Button
            variant="primary"
            onClick={() =>
              handleApply(
                '/api/integrations/qbo/import/invoices',
                setInvoicesBusy,
                setInvoicesResult,
              )
            }
            loading={invoicesBusy && !!invoicesPreview}
            disabled={!invoicesPreview}
          >
            Apply
          </Button>
        </div>
        {invoicesPreview && (
          <PreviewTable
            rows={invoicesPreview.map((r) => ({
              key: r.qboId,
              cells: [
                r.qboDocNumber ?? r.qboId.slice(0, 8),
                r.qboCustomerName,
                r.txnDate,
                fmt(r.totalCents),
                fmt(r.balanceCents),
                r.alreadyImported ? (
                  <ActionPill key="a" action="mapped" />
                ) : r.customerMissing ? (
                  <span key="m" className="font-garamond text-[0.85rem] text-amber-800">
                    Import customer first
                  </span>
                ) : (
                  <ActionPill key="a" action="create" />
                ),
              ],
            }))}
            headers={['Doc #', 'Customer', 'Date', 'Total', 'Balance', 'Action']}
          />
        )}
        <ResultBanner result={invoicesResult} />
      </Section>

      {/* Trial balance */}
      <Section title="5. Opening trial balance">
        <p className="font-garamond text-[0.92rem] text-hm-nav mb-4 leading-[1.6]">
          Posts a single manual journal entry on the cutover date that lands
          every hejmae account at the same balance QuickBooks shows. Requires
          every QB account with a balance to be mapped to a hejmae account on
          the{' '}
          <Link href="/dashboard/settings/qbo" className="underline">
            chart of accounts page
          </Link>{' '}
          first.
        </p>
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <Field label="Cutover date">
            <Input
              type="date"
              value={cutoverDate}
              onChange={(e) => setCutoverDate(e.target.value)}
            />
          </Field>
          <Button
            variant="secondary"
            onClick={async () => {
              setTbBusy(true)
              try {
                const res = await api.get<TrialBalancePreview>(
                  `/api/integrations/qbo/import/trial-balance?cutover_date=${encodeURIComponent(cutoverDate)}`,
                )
                setTbPreview(unwrap<TrialBalancePreview>(res))
              } catch (e) {
                toast.error((e as Error).message)
              } finally {
                setTbBusy(false)
              }
            }}
            loading={tbBusy && !tbPreview}
          >
            Preview
          </Button>
          <Button
            variant="primary"
            onClick={async () => {
              if (
                !confirm(
                  'Post the opening journal entry? This creates a single manual JE dated on the cutover.',
                )
              )
                return
              setTbBusy(true)
              try {
                const res = await api.post<{ journalEntryId: string; lineCount: number }>(
                  '/api/integrations/qbo/import/trial-balance',
                  { cutover_date: cutoverDate },
                )
                setTbResult(
                  unwrap<{ journalEntryId: string; lineCount: number }>(res),
                )
                toast.success('Opening JE posted')
              } catch (e) {
                toast.error((e as Error).message)
              } finally {
                setTbBusy(false)
              }
            }}
            loading={tbBusy && !!tbPreview}
            disabled={!tbPreview || !tbPreview.balanced || tbPreview.unmappedCount > 0}
          >
            Post opening JE
          </Button>
        </div>

        {tbPreview && (
          <>
            <div className="mb-3 font-garamond text-[0.9rem]">
              <span className="mr-4">
                Debits: <span className="font-mono">${tbPreview.totalDebit.toFixed(2)}</span>
              </span>
              <span className="mr-4">
                Credits: <span className="font-mono">${tbPreview.totalCredit.toFixed(2)}</span>
              </span>
              {!tbPreview.balanced && (
                <span className="text-amber-800">
                  ⚠ QB trial balance is not balanced.
                </span>
              )}
              {tbPreview.unmappedCount > 0 && (
                <span className="text-amber-800">
                  {' '}
                  {tbPreview.unmappedCount} account(s) need mapping first.
                </span>
              )}
            </div>
            <PreviewTable
              rows={tbPreview.rows.map((r) => ({
                key: r.qboAccountId,
                cells: [
                  r.qboAccountName,
                  r.debit ? `$${r.debit.toFixed(2)}` : '',
                  r.credit ? `$${r.credit.toFixed(2)}` : '',
                  r.hejmaeAccountMapped ? (
                    <span key="m" className="text-emerald-700 font-sans text-[10px] uppercase tracking-[0.18em]">
                      Mapped
                    </span>
                  ) : (
                    <span key="m" className="text-amber-800 font-sans text-[10px] uppercase tracking-[0.18em]">
                      Unmapped
                    </span>
                  ),
                ],
              }))}
              headers={['QB account', 'Debit', 'Credit', 'Mapping']}
            />
          </>
        )}

        {tbResult && (
          <div className="mt-3 p-3 border border-emerald-700/40 bg-emerald-50/40 font-garamond text-[0.9rem]">
            Posted JE <span className="font-mono">{tbResult.journalEntryId.slice(0, 8)}</span>{' '}
            with {tbResult.lineCount} lines.
          </div>
        )}
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

function PreviewTable({
  headers,
  rows,
}: {
  headers: string[]
  rows: Array<{ key: string; cells: Array<string | React.ReactNode> }>
}) {
  if (rows.length === 0) {
    return (
      <div className="border border-hm-text/10 p-4 font-garamond text-[0.9rem] text-hm-nav">
        Nothing to import.
      </div>
    )
  }
  return (
    <div className="border border-hm-text/10 max-h-[28rem] overflow-auto">
      <table className="w-full">
        <thead className="sticky top-0 bg-bg">
          <tr className="border-b border-hm-text/10 text-left font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-garamond text-[0.9rem]">
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-hm-text/5">
              {r.cells.map((c, i) => (
                <td key={i} className="px-3 py-2 align-top">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
