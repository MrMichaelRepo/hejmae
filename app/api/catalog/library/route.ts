// /api/catalog/library — designer's own library (catalog products they've
// touched via items in any project).
//
// Backed by the `designer_catalog_library` view, which collapses the
// two-step "fetch item ids → fetch catalog rows" dance into one indexed
// query. Search uses the catalog_products full-text vector — the view
// re-exposes every catalog_products column including `search_tsv`.
import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'
import { withSignedUrlsList } from '@/lib/storage'

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const { designerId } = await requireDesigner()
    const sp = req.nextUrl.searchParams
    const q = sp.get('q')?.trim() ?? null

    let query = supabaseAdmin()
      .from('designer_catalog_library')
      .select('*')
      .eq('designer_id', designerId)
      .order('last_used_at', { ascending: false })

    if (q) {
      query = query.textSearch('search_tsv', q, {
        type: 'websearch',
        config: 'simple',
      })
    }

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({
      data: await withSignedUrlsList(data ?? [], 'image_url'),
    })
  })
}
