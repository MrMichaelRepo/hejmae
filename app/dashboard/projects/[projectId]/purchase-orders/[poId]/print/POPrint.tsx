'use client'

// Standalone, print-friendly view of a single PO. Designer hits Cmd-P to
// generate a PDF until server-side React-PDF / Puppeteer is wired up.
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { formatCents, formatDate } from '@/lib/format'
import { PageSpinner } from '@/components/ui/Spinner'
import type {
  PurchaseOrder,
  PurchaseOrderLine,
  Project,
  DesignerUser,
} from '@/lib/types-ui'

interface POWith extends PurchaseOrder {
  purchase_order_line_items?: PurchaseOrderLine[]
}

export default function POPrint({
  projectId,
  poId,
}: {
  projectId: string
  poId: string
}) {
  const [po, setPo] = useState<POWith | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [designer, setDesigner] = useState<DesignerUser | null>(null)

  useEffect(() => {
    Promise.all([
      api.get<POWith>(
        `/api/projects/${projectId}/purchase-orders/${poId}`,
      ),
      api.get<Project>(`/api/projects/${projectId}`),
      api.get<DesignerUser>('/api/settings'),
    ]).then(([p, pr, u]) => {
      setPo(p.data as POWith)
      setProject(pr.data as Project)
      setDesigner(u.data as DesignerUser)
    })
  }, [projectId, poId])

  if (!po || !project || !designer) return <PageSpinner />

  const lines = po.purchase_order_line_items ?? []
  const total = lines.reduce((a, l) => a + l.total_trade_price_cents, 0)
  const brand = designer.brand_color ?? '#1e2128'

  return (
    <div className="bg-white text-hm-text">
      {/* Print-control bar — hidden when printing */}
      <div className="print:hidden flex items-center justify-between px-6 py-4 border-b border-hm-text/10 bg-bg">
        <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav">
          Purchase Order — print preview
        </div>
        <button
          onClick={() => window.print()}
          className="font-sans text-[11px] uppercase tracking-[0.2em] border border-hm-text/25 rounded-full px-5 py-2 text-hm-text hover:bg-hm-text hover:text-bg transition-colors"
        >
          Print / Save PDF
        </button>
      </div>

      <div className="max-w-[800px] mx-auto px-10 py-12 print:px-0 print:py-0">
        <div
          className="flex items-start justify-between border-b pb-6 mb-8"
          style={{ borderColor: `${brand}30` }}
        >
          <div>
            {designer.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={designer.logo_url}
                alt=""
                className="h-12 w-auto mb-3"
              />
            ) : null}
            <div
              className="font-sans text-[12px] font-bold uppercase tracking-[0.22em]"
              style={{ color: brand }}
            >
              {designer.studio_name ?? designer.name ?? 'Studio'}
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
            <div className="font-garamond text-[0.95rem] text-hm-nav mt-1">
              {formatDate(po.created_at)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 mb-10">
          <div>
            <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-2">
              Vendor
            </div>
            <div className="font-serif text-[1.1rem]">{po.vendor_name}</div>
            {po.vendor_email ? (
              <div className="font-garamond text-[0.95rem] text-hm-nav mt-1">
                {po.vendor_email}
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
            {po.expected_lead_time_days ? (
              <div className="font-garamond text-[0.85rem] text-hm-nav mt-1">
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
              <tr key={l.id} className="border-b border-hm-text/10">
                <td className="py-3">{l.description}</td>
                <td className="py-3 text-right text-hm-nav">{l.quantity}</td>
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
          <div className="mt-10 pt-6 border-t border-hm-text/10">
            <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-2">
              Notes
            </div>
            <p className="font-garamond text-[0.95rem] leading-[1.7] whitespace-pre-wrap">
              {po.notes}
            </p>
          </div>
        ) : null}

        <div className="mt-16 font-garamond text-[0.85rem] text-hm-nav text-center">
          Please confirm receipt and expected ship date by reply.
        </div>
      </div>
    </div>
  )
}
