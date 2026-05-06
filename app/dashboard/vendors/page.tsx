'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/ui/EmptyState'
import EmptyState from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PageSpinner } from '@/components/ui/Spinner'
import { toast } from '@/components/ui/Toast'
import { VendorFormModal } from './VendorFormModal'
import type { Vendor } from '@/lib/types-ui'

function formatDiscount(pct: number | null): string {
  if (pct == null) return '—'
  // Normalize: numeric(5,2) comes back as a string sometimes.
  const n = Number(pct)
  if (!Number.isFinite(n)) return '—'
  return `${n}% off retail`
}

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[] | null>(null)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Vendor | null>(null)
  const [openCreate, setOpenCreate] = useState(false)

  const load = async () => {
    const r = await api.get<Vendor[]>('/api/vendors')
    setVendors((r.data as Vendor[]) ?? [])
  }
  useEffect(() => {
    load()
  }, [])

  const filtered = (vendors ?? []).filter((v) =>
    search ? v.name.toLowerCase().includes(search.toLowerCase()) : true,
  )

  const remove = async (vendor: Vendor) => {
    if (
      !confirm(
        `Remove "${vendor.name}"? Existing items and POs that reference this vendor will keep their snapshotted vendor name. Only future auto-populate is affected.`,
      )
    )
      return
    try {
      await api.del(`/api/vendors/${vendor.id}`)
      toast.success('Vendor removed')
      load()
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

      {vendors === null ? (
        <PageSpinner />
      ) : filtered.length === 0 ? (
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
        <div className="border border-hm-text/10">
          {filtered.map((v, i) => (
            <div
              key={v.id}
              className={[
                'grid grid-cols-[2fr_1.5fr_1.5fr_auto] gap-4 items-center px-5 py-4 hover:bg-hm-text/[0.03] transition-colors',
                i > 0 ? 'border-t border-hm-text/10' : '',
              ].join(' ')}
            >
              <div>
                <div className="font-serif text-[1.1rem] leading-tight truncate">
                  {v.name}
                </div>
                {v.account_number ? (
                  <div className="font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav/80 mt-0.5">
                    Acct {v.account_number}
                  </div>
                ) : null}
              </div>
              <div className="font-garamond text-[0.95rem] text-hm-nav truncate">
                {v.contact_name ?? v.contact_email ?? '—'}
              </div>
              <div className="font-garamond text-[0.95rem] text-hm-nav hidden sm:block">
                {formatDiscount(v.trade_discount_percent)}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setEditing(v)}
                  className="font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav hover:text-hm-text"
                >
                  Edit
                </button>
                <button
                  onClick={() => remove(v)}
                  className="font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav hover:text-red-700"
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
          load()
          toast.success(editing ? 'Vendor saved' : 'Vendor added')
        }}
      />
    </div>
  )
}
