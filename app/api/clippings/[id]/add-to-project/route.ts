// POST /api/clippings/[id]/add-to-project — promote a clipping into a
// full Item on a project. Does NOT consume the clipping (the designer
// may want to add it to multiple projects).
//
// We deliberately reuse the existing items-creation contract: the
// client_price_cents is computed server-side from the project's pricing
// mode + the trade price. If the caller supplies a trade_price_cents
// here, it overrides whatever's stored on the clipping (which is the
// "restricted" scraped value — typically null).

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { loadOwnedProject } from '@/lib/auth/ownership'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, badRequest, notFound } from '@/lib/errors'
import { clippingAddToProjectInput } from '@/lib/validations/clipping'
import { calculateClientPriceCents } from '@/lib/pricing'
import {
  findVendorByName,
  shouldAutoFillTradePrice,
  tradePriceFromDiscount,
} from '@/lib/vendors'
import { upsertCatalogProduct } from '@/lib/catalog'
import { logActivity } from '@/lib/activity'

interface Ctx {
  params: Promise<{ id: string }>
}

export async function POST(req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { id } = await params
    const ctx = await requireDesigner()
    const body = clippingAddToProjectInput.parse(await req.json())

    const sb = supabaseAdmin()
    const { data: clip } = await sb
      .from('clipping_items')
      .select(
        'id, designer_id, source_url, name, vendor, image_url, retail_price_cents, trade_price_cents, catalog_product_id',
      )
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle()
    if (!clip) throw notFound('Clipping not found')
    if (clip.designer_id !== ctx.designerId) throw notFound('Clipping not found')

    const project = await loadOwnedProject(ctx.designerId, body.project_id)

    if (body.room_id) {
      const { data: room } = await sb
        .from('rooms')
        .select('id')
        .eq('id', body.room_id)
        .eq('project_id', project.id)
        .eq('designer_id', ctx.designerId)
        .maybeSingle()
      if (!room) throw badRequest('room_id does not belong to this project')
    }

    // Reuse the catalog row if we have one; otherwise upsert so the
    // master catalog grows even when the clipping never went through
    // the scrape path (e.g. it failed and the designer added it anyway).
    let catalogProductId = clip.catalog_product_id
    if (!catalogProductId && clip.name) {
      const cat = await upsertCatalogProduct({
        name: clip.name,
        vendor: clip.vendor,
        image_url: clip.image_url,
        source_url: clip.source_url,
        retail_price_cents: clip.retail_price_cents,
        designerId: ctx.designerId,
      })
      catalogProductId = cat.id
    } else if (catalogProductId) {
      // Bump the clipped_count since we're materializing a new item from it.
      const { data: cat } = await sb
        .from('catalog_products')
        .select('clipped_count')
        .eq('id', catalogProductId)
        .maybeSingle()
      if (cat) {
        await sb
          .from('catalog_products')
          .update({ clipped_count: cat.clipped_count + 1 })
          .eq('id', catalogProductId)
      }
    }

    // Trade price precedence: explicit body value → stored clip value →
    // vendor-discount-derived. Matches the items-create flow.
    let tradePriceCents = body.trade_price_cents ?? clip.trade_price_cents ?? 0
    if (clip.vendor && shouldAutoFillTradePrice(tradePriceCents)) {
      const vendorRow = await findVendorByName(ctx.designerId, clip.vendor)
      const derived = vendorRow
        ? tradePriceFromDiscount(
            clip.retail_price_cents,
            vendorRow.trade_discount_percent,
          )
        : null
      if (derived != null) tradePriceCents = derived
    }

    const { clientPriceCents } = calculateClientPriceCents(
      {
        pricingMode: project.pricing_mode,
        markupPercent: Number(project.markup_percent),
      },
      {
        tradePriceCents,
        retailPriceCents: clip.retail_price_cents,
      },
    )

    const name = clip.name?.trim() || clip.source_url

    const { data: item, error } = await sb
      .from('items')
      .insert({
        designer_id: ctx.designerId,
        project_id: project.id,
        room_id: body.room_id ?? null,
        catalog_product_id: catalogProductId,
        name,
        vendor: clip.vendor,
        image_url: clip.image_url,
        source_url: clip.source_url,
        trade_price_cents: tradePriceCents,
        retail_price_cents: clip.retail_price_cents,
        client_price_cents: clientPriceCents,
        quantity: 1,
        status: 'sourcing',
      })
      .select('id')
      .single()
    if (error) throw error

    await logActivity({
      designerId: ctx.designerId,
      projectId: project.id,
      actorType: 'designer',
      actorId: ctx.userId,
      eventType: 'item.created',
      description: `Added item "${name}" from a clipping`,
      metadata: { item_id: item.id, clipping_item_id: clip.id },
    })

    return NextResponse.json(
      { data: { item_id: item.id }, error: null },
      { status: 201 },
    )
  })
}
