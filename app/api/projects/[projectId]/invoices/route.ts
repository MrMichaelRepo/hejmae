// /api/projects/[projectId]/invoices — list + create
//
// On creation we either accept explicit lines or auto-populate from items
// currently in 'approved' status. Totals are computed from line items.
// trade_price is intentionally never written to invoice line items.
import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { loadOwnedProject } from '@/lib/auth/ownership'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, badRequest } from '@/lib/errors'
import { createInvoice } from '@/lib/validations/invoice'
import { computeInvoiceTotals } from '@/lib/finances/invoice_tax'
import { getStudioFinanceSettings } from '@/lib/finances/studio_settings'

interface Ctx {
  params: Promise<{ projectId: string }>
}

interface InvoiceLineInput {
  item_id?: string | null
  description: string
  quantity: number
  unit_price_cents: number
  taxable?: boolean
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId } = await params
    const { designerId, role, permissions } = await requireDesigner()
    requirePermission({ role, permissions }, 'finances:view')
    await loadOwnedProject(designerId, projectId)

    const { data, error } = await supabaseAdmin()
      .from('invoices')
      .select('*, invoice_line_items(*), payments(*)')
      .eq('project_id', projectId)
      .eq('designer_id', designerId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ data })
  })
}

export async function POST(req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId } = await params
    const ctx = await requireDesigner()
    const { designerId, role, permissions, studioId } = ctx
    requirePermission({ role, permissions }, 'finances:manage_invoices')
    await loadOwnedProject(designerId, projectId)
    const body = createInvoice.parse(await req.json())
    const studio = await getStudioFinanceSettings(studioId)
    const taxRateBps =
      body.tax_rate_bps !== undefined ? body.tax_rate_bps : studio.default_sales_tax_rate_bps
    const taxStateCode =
      body.tax_state_code !== undefined
        ? body.tax_state_code
        : studio.default_sales_tax_state_code

    let lines: InvoiceLineInput[] = body.lines ?? []
    if (body.from_approved_items) {
      const { data: items, error } = await supabaseAdmin()
        .from('items')
        .select('*')
        .eq('project_id', projectId)
        .eq('designer_id', designerId)
        .eq('status', 'approved')
      if (error) throw error
      const generated: InvoiceLineInput[] =
        items?.map((it) => ({
          item_id: it.id,
          description: it.name,
          quantity: it.quantity,
          unit_price_cents: it.client_price_cents,
        })) ?? []
      lines = [...lines, ...generated]
    }

    if (!lines.length) throw badRequest('Invoice has no lines')

    const totals = computeInvoiceTotals(
      lines.map((l) => ({
        unit_price_cents: l.unit_price_cents,
        quantity: l.quantity,
        taxable: !!l.taxable,
      })),
      taxRateBps,
    )

    const { data: invoice, error: invErr } = await supabaseAdmin()
      .from('invoices')
      .insert({
        designer_id: designerId,
        project_id: projectId,
        type: body.type,
        status: 'draft',
        total_cents: totals.total_cents,
        tax_rate_bps: taxRateBps,
        tax_total_cents: totals.tax_total_cents,
        tax_state_code: taxStateCode ?? null,
        notes: body.notes ?? null,
      })
      .select()
      .single()
    if (invErr) throw invErr

    const { error: liErr } = await supabaseAdmin()
      .from('invoice_line_items')
      .insert(
        lines.map((l, i) => ({
          designer_id: designerId,
          invoice_id: invoice.id,
          item_id: l.item_id ?? null,
          description: l.description,
          quantity: l.quantity,
          unit_price_cents: l.unit_price_cents,
          total_price_cents: totals.lines[i].total_price_cents,
          taxable: !!l.taxable,
          tax_cents: totals.lines[i].tax_cents,
          position: i,
        })),
      )
    if (liErr) throw liErr

    return NextResponse.json({ data: invoice }, { status: 201 })
  })
}
