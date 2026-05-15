// PATCH /api/admin/catalog/:id
//
// Updates a CatalogProduct's editable fields. If a field that participates
// in the embedding (name / vendor / description / item_type / category /
// style_tags) changes, we re-queue embedding generation asynchronously.

import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth/admin'
import { supabaseAdmin } from '@/lib/supabase/server'
import {
  withErrorHandling,
  badRequest,
  notFound,
} from '@/lib/errors'
import { updateCatalogProductInput } from '@/lib/validations/admin'
import { generateCatalogEmbedding } from '@/lib/catalog/embed'
import type { CatalogProductRow } from '@/lib/supabase/types'

const EMBEDDING_FIELDS = new Set([
  'name',
  'vendor',
  'category',
  'item_type',
  'description',
  'style_tags',
])

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async () => {
    await requireAdmin()
    const { id } = await params
    if (!id) throw badRequest('Missing product id')

    const patch = updateCatalogProductInput.parse(await req.json())
    if (Object.keys(patch).length === 0) {
      throw badRequest('No fields to update')
    }

    const sb = supabaseAdmin()
    const { data: existing, error: lookupErr } = await sb
      .from('catalog_products')
      .select('id, merged_into_id, deleted_at')
      .eq('id', id)
      .maybeSingle()
    if (lookupErr) throw lookupErr
    if (!existing) throw notFound('Catalog product not found')
    if (existing.merged_into_id) {
      throw badRequest('Cannot edit a merged catalog product')
    }
    if (existing.deleted_at) {
      throw badRequest('Cannot edit a deleted catalog product')
    }

    const { data: updated, error } = await sb
      .from('catalog_products')
      .update(patch)
      .eq('id', id)
      .select(
        'id, name, vendor, category, retail_price_cents, retail_price_last_seen_at, source_url, image_url, style_tags, clipped_count, created_by, description, item_type, deleted_at, merged_into_id, merged_at, created_at, updated_at, embedding_updated_at',
      )
      .single()
    if (error) throw error

    // Queue an embedding refresh if any embedding-relevant field changed.
    const touchedEmbedding = Object.keys(patch).some((k) =>
      EMBEDDING_FIELDS.has(k),
    )
    if (touchedEmbedding) {
      void generateCatalogEmbedding(id)
    }

    return NextResponse.json({
      data: updated as CatalogProductRow,
      error: null,
    })
  })
}
