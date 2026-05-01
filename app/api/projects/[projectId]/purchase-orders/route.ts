// /api/projects/[projectId]/purchase-orders — list + create
import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { loadOwnedProject } from '@/lib/auth/ownership'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, badRequest } from '@/lib/errors'
import { createPurchaseOrder } from '@/lib/validations/po'

interface Ctx {
  params: Promise<{ projectId: string }>
}

interface PoLineInput {
  item_id?: string | null
  description: string
  quantity: number
  trade_price_cents: number
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId } = await params
    const { designerId } = await requireDesigner()
    await loadOwnedProject(designerId, projectId)

    const { data, error } = await supabaseAdmin()
      .from('purchase_orders')
      .select('*, purchase_order_line_items(*)')
      .eq('project_id', projectId)
      .eq('designer_id', designerId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ data })
  })
}

// Create one PO. To split approved items by vendor automatically, the FE
// can call this once per vendor after pre-grouping, or hit the auto path
// (`from_approved_items: true`) which creates ONE PO per call for the
// vendor specified. TODO: server-side multi-PO grouping endpoint.
export async function POST(req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId } = await params
    const { designerId } = await requireDesigner()
    await loadOwnedProject(designerId, projectId)
    const body = createPurchaseOrder.parse(await req.json())

    let lines: PoLineInput[] = body.lines ?? []
    if (body.from_approved_items) {
      const { data: items, error } = await supabaseAdmin()
        .from('items')
        .select('*')
        .eq('project_id', projectId)
        .eq('designer_id', designerId)
        .eq('status', 'approved')
        .ilike('vendor', body.vendor_name)
      if (error) throw error
      const generated: PoLineInput[] =
        items?.map((it) => ({
          item_id: it.id,
          description: it.name,
          quantity: it.quantity,
          trade_price_cents: it.trade_price_cents,
        })) ?? []
      lines = [...lines, ...generated]
    }

    if (!lines.length) throw badRequest('PO has no lines')

    const { data: po, error: poErr } = await supabaseAdmin()
      .from('purchase_orders')
      .insert({
        designer_id: designerId,
        project_id: projectId,
        vendor_name: body.vendor_name,
        vendor_email: body.vendor_email ?? null,
        expected_lead_time_days: body.expected_lead_time_days ?? null,
        notes: body.notes ?? null,
        status: 'draft',
      })
      .select()
      .single()
    if (poErr) throw poErr

    const { error: liErr } = await supabaseAdmin()
      .from('purchase_order_line_items')
      .insert(
        lines.map((l, i) => ({
          designer_id: designerId,
          po_id: po.id,
          item_id: l.item_id ?? null,
          description: l.description,
          quantity: l.quantity,
          trade_price_cents: l.trade_price_cents,
          total_trade_price_cents: l.trade_price_cents * l.quantity,
          position: i,
        })),
      )
    if (liErr) throw liErr

    return NextResponse.json({ data: po }, { status: 201 })
  })
}
