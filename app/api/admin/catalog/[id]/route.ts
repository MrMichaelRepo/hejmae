// PATCH /api/admin/catalog/:id
//
// Updates a CatalogProduct's editable fields. If a field that participates
// in the embedding (name / vendor / brand / item_type / style_tag /
// description) changes, we re-queue embedding generation asynchronously.

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
import { CATALOG_PRODUCT_ADMIN_COLUMNS } from '@/lib/catalog/columns'
import type { CatalogProductRow } from '@/lib/supabase/types'

const EMBEDDING_FIELDS = new Set([
  'name',
  'vendor',
  'brand',
  'item_type',
  'style_tag',
  'description',
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
      .select(CATALOG_PRODUCT_ADMIN_COLUMNS)
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
