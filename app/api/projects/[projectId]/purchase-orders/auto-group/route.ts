// /api/projects/[projectId]/purchase-orders/auto-group — POST
//
// Creates one draft purchase order per vendor for every approved item in
// the project that has both a vendor and a trade price. Replaces the
// previous one-call-per-vendor pattern the client had to drive manually.
//
// Items without a vendor or without a trade price are returned in
// `skipped` (with a reason) so the UI can flag them. Items already lined
// on an existing PO are skipped too — re-running the endpoint is safe.
//
// Returns: { data: { created: PurchaseOrder[], skipped: SkippedItem[] } }
//
// Vendor matching is case-insensitive on trimmed `vendor`. We also try to
// fill in vendor_email + default_lead_time_days from the vendors table,
// same as the single-PO POST does.

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { loadOwnedProject } from '@/lib/auth/ownership'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'
import { findVendorByName } from '@/lib/vendors'

interface Ctx {
  params: Promise<{ projectId: string }>
}

interface SkippedItem {
  item_id: string
  name: string
  reason: 'no_vendor' | 'no_trade_price' | 'already_on_po'
}

export async function POST(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId } = await params
    const { designerId, role, permissions } = await requireDesigner()
    requirePermission({ role, permissions }, 'po:manage')
    await loadOwnedProject(designerId, projectId)

    const sb = supabaseAdmin()

    const { data: items, error: itemsErr } = await sb
      .from('items')
      .select('id, name, vendor, quantity, trade_price_cents')
      .eq('project_id', projectId)
      .eq('designer_id', designerId)
      .eq('status', 'approved')
    if (itemsErr) throw itemsErr

    // Items already on a PO line — skip so re-running is idempotent.
    const itemIds = (items ?? []).map((i) => i.id)
    const existingLineItemIds = new Set<string>()
    if (itemIds.length) {
      const { data: existing, error } = await sb
        .from('purchase_order_line_items')
        .select('item_id')
        .in('item_id', itemIds)
        .eq('designer_id', designerId)
      if (error) throw error
      for (const row of existing ?? []) {
        if (row.item_id) existingLineItemIds.add(row.item_id)
      }
    }

    const skipped: SkippedItem[] = []
    const byVendor = new Map<string, { display: string; items: typeof items }>()
    for (const it of items ?? []) {
      if (existingLineItemIds.has(it.id)) {
        skipped.push({ item_id: it.id, name: it.name, reason: 'already_on_po' })
        continue
      }
      const vendor = (it.vendor ?? '').trim()
      if (!vendor) {
        skipped.push({ item_id: it.id, name: it.name, reason: 'no_vendor' })
        continue
      }
      if (it.trade_price_cents == null) {
        skipped.push({ item_id: it.id, name: it.name, reason: 'no_trade_price' })
        continue
      }
      const key = vendor.toLowerCase()
      const bucket = byVendor.get(key)
      if (bucket) {
        bucket.items!.push(it)
      } else {
        byVendor.set(key, { display: vendor, items: [it] })
      }
    }

    const created: unknown[] = []
    for (const { display, items: group } of byVendor.values()) {
      if (!group || group.length === 0) continue
      const vendorRow = await findVendorByName(designerId, display)
      const { data: po, error: poErr } = await sb
        .from('purchase_orders')
        .insert({
          designer_id: designerId,
          project_id: projectId,
          vendor_name: display,
          vendor_email: vendorRow?.contact_email ?? null,
          expected_lead_time_days: vendorRow?.default_lead_time_days ?? null,
          status: 'draft',
        })
        .select()
        .single()
      if (poErr) throw poErr

      const { error: liErr } = await sb
        .from('purchase_order_line_items')
        .insert(
          group.map((it, i) => ({
            designer_id: designerId,
            po_id: po.id,
            item_id: it.id,
            description: it.name,
            quantity: it.quantity,
            trade_price_cents: it.trade_price_cents,
            total_trade_price_cents: it.trade_price_cents * it.quantity,
            position: i,
          })),
        )
      if (liErr) throw liErr
      created.push(po)
    }

    return NextResponse.json({ data: { created, skipped } }, { status: 201 })
  })
}
