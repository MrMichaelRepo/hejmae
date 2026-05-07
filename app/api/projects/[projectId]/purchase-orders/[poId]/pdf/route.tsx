// Server-side PDF rendering for purchase orders. Mirrors the invoice PDF
// route — Node runtime only because @react-pdf/renderer pulls fontkit.
import { NextResponse, type NextRequest } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, notFound } from '@/lib/errors'
import POPDF, { type POPDFData } from '@/lib/pdf/POPDF'
import type {
  PurchaseOrderRow,
  PurchaseOrderLineItemRow,
} from '@/lib/supabase/types'

export const runtime = 'nodejs'

interface Ctx {
  params: Promise<{ projectId: string; poId: string }>
}

interface POWithLines extends PurchaseOrderRow {
  purchase_order_line_items: PurchaseOrderLineItemRow[]
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
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

    if (!poRes.data || !projRes.data) throw notFound('Purchase order not found')
    const po = poRes.data as POWithLines
    const project = projRes.data

    const data: POPDFData = {
      po: {
        id: po.id,
        vendor_name: po.vendor_name,
        vendor_email: po.vendor_email,
        expected_lead_time_days: po.expected_lead_time_days,
        status: po.status,
        sent_at: po.sent_at,
        notes: po.notes,
        created_at: po.created_at,
      },
      lines: (po.purchase_order_line_items ?? []).map((l) => ({
        id: l.id,
        description: l.description,
        quantity: l.quantity,
        trade_price_cents: l.trade_price_cents,
        total_trade_price_cents: l.total_trade_price_cents,
        position: l.position,
      })),
      project: { name: project.name, location: project.location },
      designer: {
        studio_name: user.studio_name,
        name: user.name,
        logo_url: user.logo_url,
        brand_color: user.brand_color,
      },
    }

    const buffer = await renderToBuffer(<POPDF data={data} />)
    const filename = `po-${po.id.slice(0, 8)}.pdf`

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'private, max-age=0, must-revalidate',
      },
    })
  })
}
