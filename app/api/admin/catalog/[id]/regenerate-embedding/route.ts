// POST /api/admin/catalog/:id/regenerate-embedding
//
// Manually re-runs the embedding generator for one catalog product.
// Fire-and-forget, mirroring the on-insert pattern.

import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth/admin'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, badRequest, notFound } from '@/lib/errors'
import { generateCatalogEmbedding } from '@/lib/catalog/embed'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async () => {
    await requireAdmin()
    const { id } = await params
    if (!id) throw badRequest('Missing product id')

    const { data, error } = await supabaseAdmin()
      .from('catalog_products')
      .select('id, merged_into_id, deleted_at')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    if (!data) throw notFound('Catalog product not found')
    if (data.merged_into_id || data.deleted_at) {
      throw badRequest('Cannot regenerate embedding for inactive product')
    }

    void generateCatalogEmbedding(id)
    return NextResponse.json({ data: { queued: true }, error: null })
  })
}
