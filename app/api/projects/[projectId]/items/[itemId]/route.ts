import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { loadOwnedProject } from '@/lib/auth/ownership'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, notFound } from '@/lib/errors'
import { updateItem } from '@/lib/validations/item'
import { calculateClientPriceCents } from '@/lib/pricing'
import { logActivity } from '@/lib/activity'
import type { ItemRow } from '@/lib/supabase/types'

interface Ctx {
  params: Promise<{ projectId: string; itemId: string }>
}

async function loadItem(designerId: string, projectId: string, itemId: string) {
  const { data, error } = await supabaseAdmin()
    .from('items')
    .select('*')
    .eq('id', itemId)
    .eq('project_id', projectId)
    .eq('designer_id', designerId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw notFound('Item not found')
  return data as ItemRow
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId, itemId } = await params
    const { designerId } = await requireDesigner()
    await loadOwnedProject(designerId, projectId)
    const item = await loadItem(designerId, projectId, itemId)
    return NextResponse.json({ data: item })
  })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId, itemId } = await params
    const { designerId } = await requireDesigner()
    const project = await loadOwnedProject(designerId, projectId)
    const existing = await loadItem(designerId, projectId, itemId)
    const body = updateItem.parse(await req.json())

    const tradeCents =
      body.trade_price_cents ?? existing.trade_price_cents
    const retailCents =
      body.retail_price_cents !== undefined
        ? body.retail_price_cents
        : existing.retail_price_cents

    const { clientPriceCents } = calculateClientPriceCents(
      {
        pricingMode: project.pricing_mode,
        markupPercent: Number(project.markup_percent),
      },
      {
        tradePriceCents: tradeCents,
        retailPriceCents: retailCents,
      },
    )

    const { data, error } = await supabaseAdmin()
      .from('items')
      .update({
        ...body,
        trade_price_cents: tradeCents,
        retail_price_cents: retailCents,
        client_price_cents: clientPriceCents,
      })
      .eq('id', itemId)
      .eq('designer_id', designerId)
      .select()
      .single()
    if (error) throw error

    if (body.status && body.status !== existing.status) {
      await logActivity({
        designerId,
        projectId,
        actorType: 'designer',
        actorId: designerId,
        eventType: 'item.status_changed',
        description: `Item "${existing.name}" → ${body.status}`,
        metadata: {
          item_id: itemId,
          from: existing.status,
          to: body.status,
        },
      })
    }

    return NextResponse.json({ data })
  })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId, itemId } = await params
    const { designerId } = await requireDesigner()
    await loadOwnedProject(designerId, projectId)
    await loadItem(designerId, projectId, itemId)

    const { error } = await supabaseAdmin()
      .from('items')
      .delete()
      .eq('id', itemId)
      .eq('designer_id', designerId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  })
}
