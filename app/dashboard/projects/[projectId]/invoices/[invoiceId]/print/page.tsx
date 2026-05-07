import { notFound } from 'next/navigation'
import Image from 'next/image'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { formatCents, formatDate } from '@/lib/format'
import PrintBar from './PrintBar'
import type {
  InvoiceRow,
  InvoiceLineItemRow,
  PaymentRow,
} from '@/lib/supabase/types'

interface InvoiceWithLines extends InvoiceRow {
  invoice_line_items: InvoiceLineItemRow[]
  payments: PaymentRow[]
}

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ projectId: string; invoiceId: string }>
}) {
  const { projectId, invoiceId } = await params
  const { designerId, user } = await requireDesigner()
  const sb = supabaseAdmin()

  const [invRes, projRes] = await Promise.all([
    sb
      .from('invoices')
      .select('*, invoice_line_items(*), payments(*)')
      .eq('id', invoiceId)
      .eq('project_id', projectId)
      .eq('designer_id', designerId)
      .maybeSingle(),
    sb
      .from('projects')
      .select('id, name, location, client_id')
      .eq('id', projectId)
      .eq('designer_id', designerId)
      .maybeSingle(),
  ])

  if (!invRes.data || !projRes.data) notFound()
  const invoice = invRes.data as InvoiceWithLines
  const project = projRes.data

  const client = project.client_id
    ? (
        await sb
          .from('clients')
          .select('name, email')
          .eq('id', project.client_id)
          .eq('designer_id', designerId)
          .maybeSingle()
      ).data
    : null

  const lines = (invoice.invoice_line_items ?? []).slice().sort(
    (a, b) => a.position - b.position,
  )
  const paid = (invoice.payments ?? []).reduce((a, p) => a + p.amount_cents, 0)
  const balance = Math.max(0, invoice.total_cents - paid)
  const brand = user.brand_color ?? '#1e2128'

  return (
    <div className="bg-white text-hm-text">
      <PrintBar invoiceId={invoiceId} projectId={projectId} />

      <div className="max-w-[800px] mx-auto px-10 py-12 print:px-0 print:py-0">
        <div
          className="flex items-start justify-between border-b pb-6 mb-8"
          style={{ borderColor: `${brand}30` }}
        >
          <div>
            {user.logo_url ? (
              <Image
                src={user.logo_url}
                alt=""
                width={200}
                height={48}
                className="h-12 w-auto mb-3 object-contain"
                unoptimized
              />
            ) : null}
            <div
              className="font-sans text-[12px] font-bold uppercase tracking-[0.22em]"
              style={{ color: brand }}
            >
              {user.studio_name ?? user.name ?? 'Studio'}
            </div>
          </div>
          <div className="text-right">
            <div
              className="font-sans text-[10px] uppercase tracking-[0.22em]"
              style={{ color: brand }}
            >
              Invoice
            </div>
            <div className="font-serif text-[1.4rem] mt-1">
              #{invoice.id.slice(0, 8).toUpperCase()}
            </div>
            <div className="font-garamond text-[0.95rem] text-hm-nav mt-1">
              {invoice.sent_at
                ? formatDate(invoice.sent_at)
                : formatDate(invoice.created_at)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 mb-10">
          <div>
            <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-2">
              Bill to
            </div>
            <div className="font-serif text-[1.1rem]">
              {client?.name ?? '—'}
            </div>
            {client?.email ? (
              <div className="font-garamond text-[0.95rem] text-hm-nav mt-1">
                {client.email}
              </div>
            ) : null}
          </div>
          <div>
            <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-2">
              Project
            </div>
            <div className="font-serif text-[1.1rem]">{project.name}</div>
            {project.location ? (
              <div className="font-garamond text-[0.95rem] text-hm-nav mt-1">
                {project.location}
              </div>
            ) : null}
            <div className="font-garamond text-[0.85rem] text-hm-nav mt-1 capitalize">
              {invoice.type} · {invoice.status.replace('_', ' ')}
            </div>
          </div>
        </div>

        <table className="w-full font-garamond text-[0.95rem]">
          <thead>
            <tr
              className="font-sans text-[10px] uppercase tracking-[0.18em]"
              style={{ color: brand }}
            >
              <th className="text-left py-2 border-b" style={{ borderColor: brand }}>
                Description
              </th>
              <th className="text-right py-2 border-b w-16" style={{ borderColor: brand }}>
                Qty
              </th>
              <th className="text-right py-2 border-b w-32" style={{ borderColor: brand }}>
                Unit
              </th>
              <th className="text-right py-2 border-b w-32" style={{ borderColor: brand }}>
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-hm-text/10">
                <td className="py-3">{l.description}</td>
                <td className="py-3 text-right text-hm-nav">{l.quantity}</td>
                <td className="py-3 text-right">
                  {formatCents(l.unit_price_cents)}
                </td>
                <td className="py-3 text-right">
                  {formatCents(l.total_price_cents)}
                </td>
              </tr>
            ))}
            <tr>
              <td
                className="pt-5 pb-2 font-sans text-[10px] uppercase tracking-[0.22em]"
                colSpan={3}
              >
                Subtotal
              </td>
              <td className="pt-5 pb-2 text-right font-garamond">
                {formatCents(invoice.total_cents)}
              </td>
            </tr>
            {paid > 0 ? (
              <tr>
                <td
                  className="py-1 font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav"
                  colSpan={3}
                >
                  Payments received
                </td>
                <td className="py-1 text-right font-garamond text-hm-nav">
                  −{formatCents(paid)}
                </td>
              </tr>
            ) : null}
            <tr>
              <td
                className="pt-3 pb-2 font-sans text-[10px] uppercase tracking-[0.22em]"
                style={{ color: brand }}
                colSpan={3}
              >
                {balance === 0 ? 'Paid in full' : 'Balance due'}
              </td>
              <td
                className="pt-3 pb-2 text-right font-serif text-[1.4rem]"
                style={{ color: brand }}
              >
                {formatCents(balance)}
              </td>
            </tr>
          </tbody>
        </table>

        {invoice.notes ? (
          <div className="mt-10 pt-6 border-t border-hm-text/10">
            <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-2">
              Notes
            </div>
            <p className="font-garamond text-[0.95rem] leading-[1.7] whitespace-pre-wrap">
              {invoice.notes}
            </p>
          </div>
        ) : null}

        {invoice.paid_at ? (
          <div className="mt-10 font-garamond text-[0.95rem] text-hm-nav text-center">
            Paid {formatDate(invoice.paid_at)}. Thank you.
          </div>
        ) : null}
      </div>
    </div>
  )
}
