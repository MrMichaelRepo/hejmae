// POST /api/clippings/bulk-add-to-project — promote a batch of
// clippings into Items on a single project in one request. Mirrors the
// per-clipping /api/clippings/[id]/add-to-project flow but avoids the
// N-round-trip cost when a designer multi-selects on the clippings
// dashboard.
//
// Body: { project_id, room_id?, clipping_ids: string[] (1..50) }
//
// Per-clipping failures are absorbed individually (returned in
// `results` with an error code) so one bad row doesn't sink the whole
// batch.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireDesigner } from '@/lib/auth/designer'
import { loadOwnedProject } from '@/lib/auth/ownership'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, badRequest } from '@/lib/errors'
import { uuid } from '@/lib/validations/common'
import { calculateClientPriceCents } from '@/lib/pricing'
import {
  findVendorByName,
  shouldAutoFillTradePrice,
  tradePriceFromDiscount,
} from '@/lib/vendors'
import { upsertCatalogProduct } from '@/lib/catalog'
import { logActivity } from '@/lib/activity'

const bulkInput = z.object({
  project_id: uuid,
  room_id: uuid.nullish(),
  clipping_ids: z.array(uuid).min(1).max(50),
})

interface PerClippingResult {
  clipping_item_id: string
  ok: boolean
  item_id?: string
  error?: string
}

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    const body = bulkInput.parse(await req.json())

    const sb = supabaseAdmin()
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

    // Dedupe (caller could send same id twice) and load all clippings
    // in one round-trip.
    const ids = Array.from(new Set(body.clipping_ids))
    const { data: clipsRaw } = await sb
      .from('clipping_items')
      .select(
        'id, designer_id, source_url, name, brand, image_url, retail_price_cents, trade_price_cents, catalog_product_id',
      )
      .in('id', ids)
      .is('deleted_at', null)
    const clips = clipsRaw ?? []

    // Vendor (retailer) for each clipping lives on its catalog row —
    // batch-fetch those vendors once.
    const catalogIds = Array.from(
      new Set(clips.map((c) => c.catalog_product_id).filter((v): v is string => !!v)),
    )
    const catalogVendorById = new Map<string, string | null>()
    if (catalogIds.length > 0) {
      const { data: cats } = await sb
        .from('catalog_products')
        .select('id, vendor, clipped_count')
        .in('id', catalogIds)
      for (const c of cats ?? []) catalogVendorById.set(c.id, c.vendor ?? null)
    }

    const results: PerClippingResult[] = []

    for (const clipId of ids) {
      const clip = clips.find((c) => c.id === clipId)
      if (!clip) {
        results.push({ clipping_item_id: clipId, ok: false, error: 'not_found' })
        continue
      }
      if (clip.designer_id !== ctx.designerId) {
        results.push({ clipping_item_id: clipId, ok: false, error: 'not_found' })
        continue
      }

      try {
        const item = await materializeClippingToItem({
          sb,
          ctx,
          project,
          roomId: body.room_id ?? null,
          clip,
          catalogVendor: clip.catalog_product_id
            ? catalogVendorById.get(clip.catalog_product_id) ?? null
            : null,
        })
        results.push({ clipping_item_id: clipId, ok: true, item_id: item.id })

        await logActivity({
          designerId: ctx.designerId,
          projectId: project.id,
          actorType: 'designer',
          actorId: ctx.userId,
          eventType: 'item.created',
          description: `Added item "${item.name}" from a clipping (bulk)`,
          metadata: { item_id: item.id, clipping_item_id: clip.id, bulk: true },
        })
      } catch (err) {
        console.error('[clippings.bulkAdd] per-clip failure', clipId, err)
        results.push({ clipping_item_id: clipId, ok: false, error: 'insert_failed' })
      }
    }

    const okCount = results.filter((r) => r.ok).length
    return NextResponse.json(
      {
        data: { project_id: project.id, ok_count: okCount, results },
        error: null,
      },
      { status: 201 },
    )
  })
}

// Extracted helper so the per-id and bulk routes can share the same
// "clipping → catalog → trade price → item insert" logic. Kept inline
// rather than in lib/clippings because it depends on the route-level
// project/auth context shape.
async function materializeClippingToItem(args: {
  sb: ReturnType<typeof supabaseAdmin>
  ctx: { designerId: string; userId: string }
  project: { id: string; pricing_mode: string; markup_percent: number | string }
  roomId: string | null
  clip: {
    id: string
    source_url: string
    name: string | null
    brand: string | null
    image_url: string | null
    retail_price_cents: number | null
    trade_price_cents: number | null
    catalog_product_id: string | null
  }
  catalogVendor: string | null
}): Promise<{ id: string; name: string }> {
  const { sb, ctx, project, roomId, clip, catalogVendor } = args

  let catalogProductId = clip.catalog_product_id
  if (!catalogProductId && clip.name) {
    const cat = await upsertCatalogProduct({
      name: clip.name,
      vendor: null,
      image_url: clip.image_url,
      source_url: clip.source_url,
      retail_price_cents: clip.retail_price_cents,
      designerId: ctx.designerId,
    })
    catalogProductId = cat.id
  } else if (catalogProductId) {
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

  let tradePriceCents = clip.trade_price_cents ?? 0
  if (catalogVendor && shouldAutoFillTradePrice(tradePriceCents)) {
    const vendorRow = await findVendorByName(ctx.designerId, catalogVendor)
    const derived = vendorRow
      ? tradePriceFromDiscount(clip.retail_price_cents, vendorRow.trade_discount_percent)
      : null
    if (derived != null) tradePriceCents = derived
  }

  const { clientPriceCents } = calculateClientPriceCents(
    {
      pricingMode: project.pricing_mode as Parameters<typeof calculateClientPriceCents>[0]['pricingMode'],
      markupPercent: Number(project.markup_percent),
    },
    { tradePriceCents, retailPriceCents: clip.retail_price_cents },
  )

  const name = clip.name?.trim() || clip.source_url

  const { data: item, error } = await sb
    .from('items')
    .insert({
      designer_id: ctx.designerId,
      project_id: project.id,
      room_id: roomId,
      catalog_product_id: catalogProductId,
      name,
      vendor: catalogVendor,
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

  return { id: item.id, name }
}
