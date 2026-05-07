import Link from 'next/link'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import Button from '@/components/ui/Button'
import { formatCents, titleCase } from '@/lib/format'
import type { Item, Invoice, Payment, ItemStatus } from '@/lib/types-ui'

const ITEM_STATUSES: ItemStatus[] = [
  'sourcing',
  'approved',
  'ordered',
  'received',
  'installed',
]

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const { designerId } = await requireDesigner()
  const sb = supabaseAdmin()

  const [itemsRes, invoicesRes, paymentsRes] = await Promise.all([
    sb
      .from('items')
      .select('id, status')
      .eq('designer_id', designerId)
      .eq('project_id', projectId),
    sb
      .from('invoices')
      .select('id, status, total_cents')
      .eq('designer_id', designerId)
      .eq('project_id', projectId),
    sb
      .from('payments')
      .select('invoice_id, amount_cents')
      .eq('designer_id', designerId),
  ])

  const items = (itemsRes.data ?? []) as Pick<Item, 'id' | 'status'>[]
  const invoices = (invoicesRes.data ?? []) as Pick<
    Invoice,
    'id' | 'status' | 'total_cents'
  >[]
  const payments = (paymentsRes.data ?? []) as Pick<
    Payment,
    'invoice_id' | 'amount_cents'
  >[]

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

  const invoiceIds = new Set(invoices.map((i) => i.id))
  const invoicedTotal = invoices
    .filter((i) => i.status !== 'draft')
    .reduce((a, i) => a + i.total_cents, 0)
  const receivedTotal = payments
    .filter((p) => p.invoice_id && invoiceIds.has(p.invoice_id))
    .reduce((a, p) => a + p.amount_cents, 0)
  const outstandingTotal = invoicedTotal - receivedTotal

  return (
    <div className="space-y-10">
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
    </div>
  )
}
