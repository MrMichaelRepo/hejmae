'use client'

import { useCallback, useState } from 'react'
import { api } from '@/lib/api'
import { useOpenOnQuery } from '@/lib/hooks/useOpenOnQuery'
import { PageHeader } from '@/components/ui/EmptyState'
import EmptyState from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useDensity, rowClass } from '@/components/ui/Density'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { toast } from '@/components/ui/Toast'
import { VendorFormModal } from './VendorFormModal'
import type { Vendor } from '@/lib/types-ui'

function formatDiscount(pct: number | null): string {
  if (pct == null) return '—'
  const n = Number(pct)
  if (!Number.isFinite(n)) return '—'
  return `${n}% off retail`
}

export default function VendorsClient({ initialVendors }: { initialVendors: Vendor[] }) {
  const [vendors, setVendors] = useState<Vendor[]>(initialVendors)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Vendor | null>(null)
  const [openCreate, setOpenCreate] = useState(false)
  const confirm = useConfirm()
  const { density } = useDensity()

  useOpenOnQuery(
    'new',
    useCallback(() => setOpenCreate(true), []),
  )

  const reload = async () => {
    const r = await api.get<Vendor[]>('/api/vendors')
    setVendors((r.data as Vendor[]) ?? [])
  }

  const filtered = vendors.filter((v) =>
    search ? v.name.toLowerCase().includes(search.toLowerCase()) : true,
  )

  const remove = async (vendor: Vendor) => {
    const ok = await confirm({
      title: `Remove "${vendor.name}"?`,
      body: 'Existing items and POs that reference this vendor keep their snapshotted vendor name — only future auto-populate is affected.',
      confirmLabel: 'Remove',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await api.del(`/api/vendors/${vendor.id}`)
      toast.success('Vendor removed')
      reload()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="max-w-5xl">
      <PageHeader
        eyebrow="Vendors"
        title="Trade accounts"
        subtitle="Account details, contacts, and standard discounts. Auto-fill kicks in on items and purchase orders when the vendor name matches."
        actions={
          <Button variant="primary" onClick={() => setOpenCreate(true)}>
            + New vendor
          </Button>
        }
      />

      <Input
        placeholder="Search vendors…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm mb-6"
      />

      {filtered.length === 0 ? (
        <EmptyState
          title={vendors.length === 0 ? 'No vendors yet' : 'No matches'}
          body={
            vendors.length === 0
              ? 'Save a vendor record once and trade pricing, contacts, and lead times auto-fill on items and POs.'
              : 'Try a different search term.'
          }
          action={
            vendors.length === 0 ? (
              <Button variant="primary" onClick={() => setOpenCreate(true)}>
                Add first vendor
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="border border-line">
          {filtered.map((v, i) => (
            <div
              key={v.id}
              className={[
                'grid grid-cols-[2fr_1.5fr_1.5fr_auto] gap-4 items-center px-5 hover:bg-ink/[0.03] transition-colors',
                rowClass(density),
                i > 0 ? 'border-t border-line' : '',
              ].join(' ')}
            >
              <div>
                <div className="font-serif text-[1.1rem] leading-tight truncate flex items-center gap-2">
                  <span>{v.name}</span>
                  {v.is_1099_eligible ? (
                    <span
                      title={
                        v.tax_id_last4
                          ? `1099-NEC · TIN ending ${v.tax_id_last4}`
                          : '1099-NEC · TIN missing'
                      }
                    >
                      <Badge tone="sage">1099</Badge>
                    </span>
                  ) : null}
                </div>
                {v.account_number ? (
                  <div className="font-sans text-[10px] uppercase tracking-[0.18em] text-ink-subtle mt-0.5">
                    Acct {v.account_number}
                  </div>
                ) : null}
                {v.is_1099_eligible && !v.tax_id_last4 ? (
                  <div className="font-sans text-[9px] uppercase tracking-[0.2em] text-warn mt-0.5">
                    Missing W-9 / TIN
                  </div>
                ) : null}
              </div>
              <div className="font-garamond text-[0.95rem] text-ink-muted truncate">
                {v.contact_name ?? v.contact_email ?? '—'}
              </div>
              <div className="font-garamond text-[0.95rem] text-ink-muted hidden sm:block">
                {formatDiscount(v.trade_discount_percent)}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setEditing(v)}
                  className="font-sans text-[10px] uppercase tracking-[0.18em] text-ink-muted hover:text-ink"
                >
                  Edit
                </button>
                <button
                  onClick={() => remove(v)}
                  className="font-sans text-[10px] uppercase tracking-[0.18em] text-ink-muted hover:text-danger"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <VendorFormModal
        open={openCreate || editing !== null}
        initial={editing}
        onClose={() => {
          setOpenCreate(false)
          setEditing(null)
        }}
        onSaved={() => {
          setOpenCreate(false)
          setEditing(null)
          reload()
          toast.success(editing ? 'Vendor saved' : 'Vendor added')
        }}
      />
    </div>
  )
}
