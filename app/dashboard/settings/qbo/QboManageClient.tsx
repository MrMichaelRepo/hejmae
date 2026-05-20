'use client'

// Settings page for QuickBooks Online: chart-of-accounts mapping +
// recent sync log with per-row resync.
//
// Loads in three parallel fetches:
//   * /api/integrations/qbo/mappings  — hejmae accounts + current mappings
//   * /api/integrations/qbo/accounts  — QBO accounts list (picker source)
//   * /api/integrations/qbo/sync-log  — last ~100 attempts
//
// If QBO isn't connected, the QBO accounts fetch fails — we surface that
// inline instead of a global crash.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import Button from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import { toast } from '@/components/ui/Toast'
import { PageHeader } from '@/components/ui/EmptyState'
import type {
  AccountRow,
  QboEntityType,
  QboSyncDirection,
  QboSyncStatus,
} from '@/lib/supabase/types'

interface QboAccount {
  id: string
  name: string
  fullyQualifiedName: string
  accountType: string
  classification: string | null
  active: boolean
}

interface MappingsResponse {
  accounts: AccountRow[]
  mappings: Record<string, string>
}

interface SyncLogRow {
  id: string
  entity_type: QboEntityType
  hejmae_id: string | null
  qbo_id: string | null
  direction: QboSyncDirection
  status: QboSyncStatus
  error_code: string | null
  error_message: string | null
  created_at: string
}

type ResyncableEntityType =
  | 'customer'
  | 'vendor'
  | 'invoice'
  | 'payment'
  | 'expense'
  | 'journal_entry'

const RESYNCABLE: Set<QboEntityType> = new Set([
  'customer',
  'vendor',
  'invoice',
  'payment',
  'expense',
  'journal_entry',
])

export default function QboManageClient() {
  const [hejmaeAccounts, setHejmaeAccounts] = useState<AccountRow[]>([])
  const [mappings, setMappings] = useState<Record<string, string>>({})
  const [qboAccounts, setQboAccounts] = useState<QboAccount[] | null>(null)
  const [qboLoadError, setQboLoadError] = useState<string | null>(null)
  const [syncLog, setSyncLog] = useState<SyncLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [resyncingId, setResyncingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const mappingsRes = await api.get<MappingsResponse>(
        '/api/integrations/qbo/mappings',
      )
      const m = (mappingsRes as { data?: MappingsResponse }).data ?? null
      if (m) {
        setHejmaeAccounts(m.accounts)
        setMappings(m.mappings)
      } else {
        const raw = mappingsRes as unknown as MappingsResponse
        setHejmaeAccounts(raw.accounts ?? [])
        setMappings(raw.mappings ?? {})
      }
    } catch (e) {
      toast.error((e as Error).message)
    }
    try {
      const qboRes = await api.get<{ data: QboAccount[] }>(
        '/api/integrations/qbo/accounts',
      )
      const list = (qboRes as { data?: QboAccount[] }).data ?? []
      setQboAccounts(list)
      setQboLoadError(null)
    } catch (e) {
      setQboAccounts(null)
      setQboLoadError((e as Error).message)
    }
    try {
      const logRes = await api.get<{ data: SyncLogRow[] }>(
        '/api/integrations/qbo/sync-log',
      )
      setSyncLog((logRes as { data?: SyncLogRow[] }).data ?? [])
    } catch (e) {
      toast.error((e as Error).message)
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const updateMapping = async (
    hejmaeAccountId: string,
    qboAccountId: string | null,
  ) => {
    setSavingId(hejmaeAccountId)
    try {
      await api.put('/api/integrations/qbo/mappings', {
        account_id: hejmaeAccountId,
        qbo_account_id: qboAccountId,
      })
      setMappings((m) => {
        const next = { ...m }
        if (qboAccountId) next[hejmaeAccountId] = qboAccountId
        else delete next[hejmaeAccountId]
        return next
      })
      toast.success(qboAccountId ? 'Mapping saved' : 'Mapping cleared')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSavingId(null)
    }
  }

  const resync = async (row: SyncLogRow) => {
    if (!row.hejmae_id) return
    if (!RESYNCABLE.has(row.entity_type)) return
    setResyncingId(row.id)
    try {
      await api.post('/api/integrations/qbo/resync', {
        entity_type: row.entity_type as ResyncableEntityType,
        hejmae_id: row.hejmae_id,
      })
      toast.success('Resync triggered')
      await load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setResyncingId(null)
    }
  }

  const groupedQbo = useMemo(() => {
    if (!qboAccounts) return []
    // Group QB accounts by Classification so the picker has structure.
    const byType: Record<string, QboAccount[]> = {}
    for (const a of qboAccounts) {
      if (!a.active) continue
      const k = a.classification ?? a.accountType
      ;(byType[k] ??= []).push(a)
    }
    return Object.entries(byType).sort(([a], [b]) => a.localeCompare(b))
  }, [qboAccounts])

  return (
    <div className="max-w-4xl">
      <PageHeader
        eyebrow="Settings · Accounting"
        title="QuickBooks mapping"
        subtitle="Tell hejmae which QuickBooks account each of your chart-of-account entries should post to."
      />

      <div className="mb-6 flex items-center justify-between font-garamond text-[0.95rem]">
        <Link href="/dashboard/settings" className="underline">
          ← Back to settings
        </Link>
        <Link
          href="/dashboard/settings/qbo/import"
          className="inline-flex items-center gap-2 font-sans text-[10px] uppercase tracking-[0.2em] text-hm-text border border-hm-text/25 hover:bg-hm-text hover:text-bg rounded-full px-5 py-2 transition-colors"
        >
          Import from QuickBooks →
        </Link>
      </div>

      {/* Account mapping */}
      <section className="mb-12">
        <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-4">
          Chart of accounts
        </div>
        <div className="border border-hm-text/10">
          {qboLoadError ? (
            <div className="p-4 bg-amber-50 text-amber-900 font-garamond text-[0.9rem] border-b border-amber-200">
              Couldn&rsquo;t load QuickBooks accounts: {qboLoadError}. Connect
              QuickBooks first from{' '}
              <Link href="/dashboard/settings" className="underline">
                Settings → Accounting
              </Link>
              .
            </div>
          ) : null}
          {loading ? (
            <div className="p-6 font-garamond text-hm-nav">Loading…</div>
          ) : hejmaeAccounts.length === 0 ? (
            <div className="p-6 font-garamond text-hm-nav">
              No accounts found. Bootstrap your chart of accounts first.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-hm-text/10 text-left font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav">
                  <th className="px-4 py-2">Code</th>
                  <th className="px-4 py-2">hejmae account</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">→ QuickBooks account</th>
                </tr>
              </thead>
              <tbody className="font-garamond text-[0.92rem]">
                {hejmaeAccounts.map((a) => (
                  <tr key={a.id} className="border-b border-hm-text/5">
                    <td className="px-4 py-2 font-mono text-[0.85rem]">{a.code}</td>
                    <td className="px-4 py-2">{a.name}</td>
                    <td className="px-4 py-2 capitalize text-hm-nav">{a.type}</td>
                    <td className="px-4 py-2">
                      <Select
                        value={mappings[a.id] ?? ''}
                        onChange={(e) =>
                          updateMapping(a.id, e.target.value || null)
                        }
                        disabled={savingId === a.id || !qboAccounts}
                      >
                        <option value="">— Not mapped —</option>
                        {groupedQbo.map(([group, accts]) => (
                          <optgroup key={group} label={group}>
                            {accts.map((q) => (
                              <option key={q.id} value={q.id}>
                                {q.fullyQualifiedName}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="mt-3 font-garamond text-[0.85rem] text-hm-nav leading-[1.55]">
          Unmapped accounts that show up on invoices, expenses, or journal
          entries will cause those records to skip the QuickBooks push and
          surface in the sync log below.
        </p>
      </section>

      {/* Sync log */}
      <section className="mb-12">
        <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-4 flex items-center justify-between">
          <span>Recent sync activity</span>
          <button
            onClick={() => void load()}
            className="font-sans text-[10px] uppercase tracking-[0.18em] underline"
          >
            Refresh
          </button>
        </div>
        <div className="border border-hm-text/10">
          {syncLog.length === 0 ? (
            <div className="p-6 font-garamond text-hm-nav">
              Nothing synced yet. Once you map your chart of accounts and create
              an invoice, payment, or expense, attempts will show up here.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-hm-text/10 text-left font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav">
                  <th className="px-4 py-2">When</th>
                  <th className="px-4 py-2">Entity</th>
                  <th className="px-4 py-2">Direction</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Detail</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="font-garamond text-[0.9rem]">
                {syncLog.map((r) => (
                  <tr key={r.id} className="border-b border-hm-text/5 align-top">
                    <td className="px-4 py-2 whitespace-nowrap text-hm-nav">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 capitalize">
                      {r.entity_type.replace('_', ' ')}
                      {r.hejmae_id ? (
                        <div className="font-mono text-[0.75rem] text-hm-nav">
                          {r.hejmae_id.slice(0, 8)}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 capitalize">{r.direction}</td>
                    <td className="px-4 py-2">
                      {r.status === 'success' ? (
                        <span className="text-emerald-700">Success</span>
                      ) : (
                        <span className="text-amber-800">Error</span>
                      )}
                    </td>
                    <td className="px-4 py-2 max-w-[28rem] break-words">
                      {r.status === 'success' ? (
                        r.qbo_id ? (
                          <span className="font-mono text-[0.8rem] text-hm-nav">
                            QBO id: {r.qbo_id}
                          </span>
                        ) : null
                      ) : (
                        <span className="text-amber-900">
                          {r.error_message ?? r.error_code ?? 'Unknown error'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {RESYNCABLE.has(r.entity_type) && r.hejmae_id ? (
                        <Button
                          variant="ghost"
                          onClick={() => resync(r)}
                          loading={resyncingId === r.id}
                        >
                          Resync
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}
