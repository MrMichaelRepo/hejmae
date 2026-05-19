// /api/catalog — search the master catalog
//
// Search uses the `search_tsv` generated tsvector (GIN-indexed). Queries
// flow through Postgres `websearch_to_tsquery` via the `fts` operator so
// users get phrase support ("barcelona chair") and OR / negation
// (-replica). Empty / no-match queries fall through to the top-clipped
// order so the catalog still feels useful when browsing.
import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'
import { withSignedUrlsList } from '@/lib/storage'

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    await requireDesigner()
    const sp = req.nextUrl.searchParams
    const q = sp.get('q')?.trim() ?? null
    const vendor = sp.get('vendor')
    const category = sp.get('category')
    const limit = Math.min(Number(sp.get('limit') ?? 50), 200)

    let query = supabaseAdmin()
      .from('catalog_products')
      .select('*')
      .is('merged_into_id', null)
      .is('deleted_at', null)
      .order('clipped_count', { ascending: false })
      .limit(limit)

    if (q) {
      query = query.textSearch('search_tsv', q, {
        type: 'websearch',
        config: 'simple',
      })
    }
    if (vendor) query = query.ilike('vendor', vendor)
    if (category) query = query.ilike('category', category)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({
      data: await withSignedUrlsList(data ?? [], 'image_url'),
    })
  })
}
