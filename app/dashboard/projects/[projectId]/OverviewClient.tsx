'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { formatCents, titleCase } from '@/lib/format'
import { PageSpinner } from '@/components/ui/Spinner'
import Button from '@/components/ui/Button'
import type { Item, Invoice, Payment, ItemStatus } from '@/lib/types-ui'

const ITEM_STATUSES: ItemStatus[] = [
  'sourcing',
  'approved',
  'ordered',
  'received',
  'installed',
]

interface InvoiceWithLines extends Invoice {
  payments?: Payment[]
}

export default function OverviewClient({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<Item[] | null>(null)
  const [invoices, setInvoices] = useState<InvoiceWithLines[] | null>(null)

  useEffect(() => {
    Promise.all([
      api.get<Item[]>(`/api/projects/${projectId}/items`),
      api.get<InvoiceWithLines[]>(`/api/projects/${projectId}/invoices`),
    ]).then(([i, inv]) => {
      setItems((i.data as Item[]) ?? [])
      setInvoices((inv.data as InvoiceWithLines[]) ?? [])
    })
  }, [projectId])

  if (!items || !invoices) return <PageSpinner />

  const itemCounts: Record<ItemStatus, number> = {
    sourcing: 0,
    approved: 0,
    ordered: 0,
    received: 0,
    installed: 0,
  }
  items.forEach((it) => {
    itemCounts[it.status] += 1
  })

  const invoicedTotal = invoices
    .filter((i) => i.status !== 'draft')
    .reduce((a, i) => a + i.total_cents, 0)
  const receivedTotal = invoices
    .flatMap((i) => i.payments ?? [])
    .reduce((a, p) => a + p.amount_cents, 0)
  const outstandingTotal = invoicedTotal - receivedTotal

  return (
    <div className="space-y-10">
      {/* Item status summary */}
      <section>
        <h2 className="font-serif text-[1.3rem] leading-tight mb-4">Items</h2>
        <div
          className="grid grid-cols-2 sm:grid-cols-5 gap-px"
          style={{ background: 'rgba(30,33,40,0.1)' }}
        >
          {ITEM_STATUSES.map((s) => (
            <Link
              key={s}
              href={`/dashboard/projects/${projectId}/items?status=${s}`}
              className="bg-bg p-5 hover:bg-hm-text/[0.03] transition-colors"
            >
              <div className="font-sans text-[10px] uppercase tracking-[0.2em] text-hm-nav mb-2">
                {titleCase(s)}
              </div>
              <div className="font-serif text-[1.6rem] leading-none">
                {itemCounts[s]}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Money summary */}
      <section>
        <h2 className="font-serif text-[1.3rem] leading-tight mb-4">Money</h2>
        <div
          className="grid grid-cols-1 sm:grid-cols-3 gap-px"
          style={{ background: 'rgba(30,33,40,0.1)' }}
        >
          {[
            ['Invoiced', invoicedTotal],
            ['Received', receivedTotal],
            ['Outstanding', outstandingTotal],
          ].map(([label, value]) => (
            <div key={label as string} className="bg-bg p-5">
              <div className="font-sans text-[10px] uppercase tracking-[0.2em] text-hm-nav mb-2">
                {label as string}
              </div>
              <div className="font-serif text-[1.4rem] leading-none">
                {formatCents(value as number)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Quick actions */}
      <section>
        <h2 className="font-serif text-[1.3rem] leading-tight mb-4">Quick actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link href={`/dashboard/projects/${projectId}/items`}>
            <Button variant="primary">+ Add item</Button>
          </Link>
          <Link href={`/dashboard/projects/${projectId}/proposal`}>
            <Button variant="secondary">Build proposal</Button>
          </Link>
          <Link href={`/dashboard/projects/${projectId}/invoices`}>
            <Button variant="secondary">Create invoice</Button>
          </Link>
          <Link href={`/dashboard/projects/${projectId}/purchase-orders`}>
            <Button variant="secondary">New PO</Button>
          </Link>
        </div>
      </section>

      {false ? (
        <div className="border border-hm-text/15 p-5 flex flex-wrap items-center gap-3 justify-between">
          <div className="font-garamond text-[0.95rem] text-hm-nav truncate" />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {}}
          >
            Copy
          </Button>
        </div>
      ) : null}
    </div>
  )
}
