import { notFound } from 'next/navigation'
import Image from 'next/image'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { resolveAssetUrl } from '@/lib/storage'
import { formatCents, formatDate } from '@/lib/format'
import PrintBar from './PrintBar'
import type {
  PurchaseOrderRow,
  PurchaseOrderLineItemRow,
} from '@/lib/supabase/types'

interface POWithLines extends PurchaseOrderRow {
  purchase_order_line_items: PurchaseOrderLineItemRow[]
}

export default async function POPrintPage({
  params,
}: {
  params: Promise<{ projectId: string; poId: string }>
}) {
  const { projectId, poId } = await params
  const { designerId, user } = await requireDesigner()
  const sb = supabaseAdmin()

  const [poRes, projRes] = await Promise.all([
    sb
      .from('purchase_orders')
      .select('*, purchase_order_line_items(*)')
      .eq('id', poId)
      .eq('project_id', projectId)
      .eq('designer_id', designerId)
      .maybeSingle(),
    sb
      .from('projects')
      .select('id, name, location')
      .eq('id', projectId)
      .eq('designer_id', designerId)
      .maybeSingle(),
  ])

  if (!poRes.data || !projRes.data) notFound()
  const po = poRes.data as POWithLines
  const project = projRes.data

  const lines = (po.purchase_order_line_items ?? []).slice().sort(
    (a, b) => a.position - b.position,
  )
  const total = lines.reduce((a, l) => a + l.total_trade_price_cents, 0)
  const brand = user.brand_color ?? '#1e2128'
  const logoSignedUrl = await resolveAssetUrl(user.logo_url)

  return (
    <div className="bg-white text-ink">
      <PrintBar projectId={projectId} poId={poId} />

      <div className="max-w-[800px] mx-auto px-10 py-12 print:px-0 print:py-0">
        <div
          className="flex items-start justify-between border-b pb-6 mb-8"
          style={{ borderColor: `${brand}30` }}
        >
          <div>
            {logoSignedUrl ? (
              <Image
                src={logoSignedUrl}
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
              Purchase Order
            </div>
            <div className="font-serif text-[1.4rem] mt-1">
              #{po.id.slice(0, 8).toUpperCase()}
            </div>
            <div className="font-garamond text-[0.95rem] text-ink-muted mt-1">
              {formatDate(po.sent_at ?? po.created_at)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 mb-10">
          <div>
            <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted mb-2">
              Vendor
            </div>
            <div className="font-serif text-[1.1rem]">{po.vendor_name}</div>
            {po.vendor_email ? (
              <div className="font-garamond text-[0.95rem] text-ink-muted mt-1">
                {po.vendor_email}
              </div>
            ) : null}
          </div>
          <div>
            <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted mb-2">
              Project
            </div>
            <div className="font-serif text-[1.1rem]">{project.name}</div>
            {project.location ? (
              <div className="font-garamond text-[0.95rem] text-ink-muted mt-1">
                {project.location}
              </div>
            ) : null}
            {po.expected_lead_time_days ? (
              <div className="font-garamond text-[0.85rem] text-ink-muted mt-1">
                Lead time: {po.expected_lead_time_days} days
              </div>
            ) : null}
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
              <tr key={l.id} className="border-b border-line">
                <td className="py-3">{l.description}</td>
                <td className="py-3 text-right text-ink-muted">{l.quantity}</td>
                <td className="py-3 text-right">
                  {formatCents(l.trade_price_cents)}
                </td>
                <td className="py-3 text-right">
                  {formatCents(l.total_trade_price_cents)}
                </td>
              </tr>
            ))}
            <tr>
              <td
                className="pt-5 pb-2 font-sans text-[10px] uppercase tracking-[0.22em]"
                colSpan={3}
              >
                Total
              </td>
              <td className="pt-5 pb-2 text-right font-serif text-[1.4rem]">
                {formatCents(total)}
              </td>
            </tr>
          </tbody>
        </table>

        {po.notes ? (
          <div className="mt-10 pt-6 border-t border-line">
            <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted mb-2">
              Notes
            </div>
            <p className="font-garamond text-[0.95rem] leading-[1.7] whitespace-pre-wrap">
              {po.notes}
            </p>
          </div>
        ) : null}

        <div className="mt-16 font-garamond text-[0.85rem] text-ink-muted text-center">
          Please confirm receipt and expected ship date by reply.
        </div>
      </div>
    </div>
  )
}
