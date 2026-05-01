// /api/projects/[projectId]/items — list + create
//
// Two creation paths:
//   1. New item (no catalog_product_id) → silently upsert a CatalogProduct
//      via the catalog write-on-add flow.
//   2. From an existing CatalogProduct (catalog_product_id supplied) →
//      copy denormalized fields and bump the catalog row's clipped_count.
//
// In both cases client_price_cents is computed server-side using the
// project's pricing mode + markup. The request body is never trusted for
// client_price.
import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { loadOwnedProject } from '@/lib/auth/ownership'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, badRequest } from '@/lib/errors'
import { createItem } from '@/lib/validations/item'
import { calculateClientPriceCents } from '@/lib/pricing'
import { upsertCatalogProduct } from '@/lib/catalog'
import { logActivity } from '@/lib/activity'

interface Ctx {
  params: Promise<{ projectId: string }>
}

export async function GET(req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId } = await params
    const { designerId } = await requireDesigner()
    await loadOwnedProject(designerId, projectId)
    const sp = req.nextUrl.searchParams
    const status = sp.get('status')
    const roomId = sp.get('room_id')

    let q = supabaseAdmin()
      .from('items')
      .select('*')
      .eq('project_id', projectId)
      .eq('designer_id', designerId)
      .order('created_at', { ascending: false })

    if (status) q = q.eq('status', status)
    if (roomId) q = q.eq('room_id', roomId)

    const { data, error } = await q
    if (error) throw error
    return NextResponse.json({ data })
  })
}

export async function POST(req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId } = await params
    const { designerId } = await requireDesigner()
    const project = await loadOwnedProject(designerId, projectId)
    const body = createItem.parse(await req.json())

    if (body.room_id) {
      const { data: room } = await supabaseAdmin()
        .from('rooms')
        .select('id')
        .eq('id', body.room_id)
        .eq('project_id', projectId)
        .eq('designer_id', designerId)
        .maybeSingle()
      if (!room) throw badRequest('room_id does not belong to this project')
    }

    let catalogProductId: string | null = body.catalog_product_id ?? null
    let name = body.name
    let vendor = body.vendor ?? null
    let imageUrl = body.image_url ?? null
    let sourceUrl = body.source_url ?? null
    let retailPriceCents = body.retail_price_cents ?? null

    if (catalogProductId) {
      // Copy denormalized fields from the catalog row + bump clipped_count.
      const { data: cat, error: catErr } = await supabaseAdmin()
        .from('catalog_products')
        .select('*')
        .eq('id', catalogProductId)
        .maybeSingle()
      if (catErr) throw catErr
      if (!cat) throw badRequest('catalog_product_id not found')
      name = body.name || cat.name
      vendor = vendor ?? cat.vendor
      imageUrl = imageUrl ?? cat.image_url
      sourceUrl = sourceUrl ?? cat.source_url
      retailPriceCents = retailPriceCents ?? cat.retail_price_cents
      await supabaseAdmin()
        .from('catalog_products')
        .update({ clipped_count: cat.clipped_count + 1 })
        .eq('id', catalogProductId)
    } else {
      // Catalog write-on-add: silent.
      const cat = await upsertCatalogProduct({
        name,
        vendor,
        image_url: imageUrl,
        source_url: sourceUrl,
        retail_price_cents: retailPriceCents,
        designerId,
      })
      catalogProductId = cat.id
    }

    const { clientPriceCents } = calculateClientPriceCents(
      {
        pricingMode: project.pricing_mode,
        markupPercent: Number(project.markup_percent),
      },
      {
        tradePriceCents: body.trade_price_cents,
        retailPriceCents: retailPriceCents,
      },
    )

    const { data, error } = await supabaseAdmin()
      .from('items')
      .insert({
        designer_id: designerId,
        project_id: projectId,
        room_id: body.room_id ?? null,
        catalog_product_id: catalogProductId,
        name,
        vendor,
        image_url: imageUrl,
        source_url: sourceUrl,
        trade_price_cents: body.trade_price_cents,
        retail_price_cents: retailPriceCents,
        client_price_cents: clientPriceCents,
        quantity: body.quantity ?? 1,
        status: body.status ?? 'sourcing',
        floor_plan_pin_x: body.floor_plan_pin_x ?? null,
        floor_plan_pin_y: body.floor_plan_pin_y ?? null,
        notes: body.notes ?? null,
      })
      .select()
      .single()
    if (error) throw error

    await logActivity({
      designerId,
      projectId,
      actorType: 'designer',
      actorId: designerId,
      eventType: 'item.created',
      description: `Added item "${name}"`,
      metadata: { item_id: data.id },
    })

    return NextResponse.json({ data }, { status: 201 })
  })
}
