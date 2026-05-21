'use client'

// Banking landing page: upload a CSV statement + list past imports.
// Per-import review lives at /dashboard/finances/banking/[importId].

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'
import { Field, Select } from '@/components/ui/Input'
import { toast } from '@/components/ui/Toast'
import type {
  AccountRow,
  BankImportSource,
  BankStatementImportRow,
} from '@/lib/supabase/types'

const SOURCES: Array<[BankImportSource, string]> = [
  ['generic', 'Auto-detect'],
  ['chase', 'Chase'],
  ['bofa', 'Bank of America'],
  ['amex', 'American Express'],
]

export default function BankingClient({
  initialImports,
  cashAccounts,
}: {
  initialImports: BankStatementImportRow[]
  cashAccounts: AccountRow[]
}) {
  const router = useRouter()
  const [imports] = useState<BankStatementImportRow[]>(initialImports)
  const [file, setFile] = useState<File | null>(null)
  const [source, setSource] = useState<BankImportSource>('generic')
  const [accountId, setAccountId] = useState<string>('')
  const [uploading, setUploading] = useState(false)

  const handleUpload = async () => {
    if (!file) {
      toast.error('Choose a CSV file first.')
      return
    }
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('source', source)
    if (accountId) fd.append('account_id', accountId)
    try {
      const res = await fetch('/api/finances/bank-imports', {
        method: 'POST',
        body: fd,
      })
      const text = await res.text()
      const body = text ? JSON.parse(text) : {}
      if (!res.ok) {
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`)
      }
      toast.success('Statement uploaded — AI matching running…')
      const importId = body?.data?.id
      if (importId) router.push(`/dashboard/finances/banking/${importId}`)
      else router.refresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Finances"
        title="Banking"
        subtitle="Upload a CSV bank or credit-card statement. We parse the rows and use AI to propose matches against your expenses and invoice payments — accept or reject each in the review screen."
      />

      <section className="mb-10 border border-line p-6">
        <h2 className="font-serif text-[1.2rem] mb-4">Upload statement</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="CSV file">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="font-garamond text-[0.92rem]"
            />
          </Field>
          <Field label="Bank format">
            <Select
              value={source}
              onChange={(e) => setSource(e.target.value as BankImportSource)}
            >
              {SOURCES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Which account?"
            hint="Optional — scopes future matching. Pick the bank or credit card this statement covers."
          >
            <Select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">— None —</option>
              {cashAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-4">
          <Button
            variant="primary"
            onClick={handleUpload}
            loading={uploading}
            disabled={!file}
          >
            Upload & parse
          </Button>
        </div>
      </section>

      <section>
        <h2 className="font-serif text-[1.2rem] mb-4">Recent imports</h2>
        {imports.length === 0 ? (
          <div className="border border-line p-6 font-garamond text-[0.95rem] text-ink-muted italic">
            No statements imported yet.
          </div>
        ) : (
          <div className="border border-line overflow-x-auto">
            <table className="w-full font-garamond text-[0.92rem]">
              <thead>
                <tr className="bg-ink/[0.03] font-sans text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                  <th className="text-left px-4 py-3">Uploaded</th>
                  <th className="text-left px-4 py-3">File</th>
                  <th className="text-left px-4 py-3">Source</th>
                  <th className="text-left px-4 py-3">Period</th>
                  <th className="text-right px-4 py-3">Rows</th>
                  <th className="text-right px-4 py-3">Matched</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {imports.map((i) => (
                  <tr key={i.id} className="border-t border-line">
                    <td className="px-4 py-3 text-ink-muted whitespace-nowrap">
                      {new Date(i.uploaded_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 break-all">{i.filename}</td>
                    <td className="px-4 py-3 capitalize text-ink-muted">{i.source}</td>
                    <td className="px-4 py-3 text-ink-muted whitespace-nowrap">
                      {i.period_start ?? '—'} → {i.period_end ?? '—'}
                    </td>
                    <td className="text-right px-4 py-3">{i.row_count}</td>
                    <td className="text-right px-4 py-3">{i.matched_count}</td>
                    <td className="px-4 py-3 capitalize">
                      <StatusPill status={i.status} />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/finances/banking/${i.id}`}
                        className="font-sans text-[10px] uppercase tracking-[0.18em] underline"
                      >
                        Review →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function StatusPill({ status }: { status: BankStatementImportRow['status'] }) {
  const cls =
    status === 'matched' || status === 'completed'
      ? 'text-success border-success/30'
      : status === 'failed'
        ? 'text-warn border-warn/30'
        : 'text-ink-muted border-line'
  return (
    <span
      className={`font-sans text-[10px] uppercase tracking-[0.18em] border px-2 py-0.5 ${cls}`}
    >
      {status}
    </span>
  )
}
