// DELETE /api/clippings/[id] — only the original clipper can delete
// their own clipping; other studio members see the row in the feed but
// can't remove it.
//
// Delete mode depends on whether the clipping is linked to a catalog
// product:
//   - catalog_product_id set → HARD delete. The product data lives in
//     catalog_products, so the per-user clipping row is just bookkeeping
//     and we don't want to keep it stored in two places.
//   - catalog_product_id null (pending / failed scrape) → SOFT delete.
//     No catalog row exists yet; keep the clipping around for retry /
//     restore. Partial-unique dedup index allows re-clipping later.

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, forbidden, notFound } from '@/lib/errors'

interface Ctx {
  params: Promise<{ id: string }>
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { id } = await params
    const ctx = await requireDesigner()

    const sb = supabaseAdmin()
    const { data: row } = await sb
      .from('clipping_items')
      .select('id, designer_id, clipper_user_id, deleted_at, catalog_product_id')
      .eq('id', id)
      .maybeSingle()
    if (!row || row.deleted_at) throw notFound('Clipping not found')
    if (row.designer_id !== ctx.designerId) throw notFound('Clipping not found')
    if (row.clipper_user_id !== ctx.userId) {
      throw forbidden('Only the original clipper can delete this')
    }

    if (row.catalog_product_id) {
      const { error } = await sb
        .from('clipping_items')
        .delete()
        .eq('id', id)
      if (error) throw error
    } else {
      const { error } = await sb
        .from('clipping_items')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    }

    return NextResponse.json({ data: { id }, error: null })
  })
}
