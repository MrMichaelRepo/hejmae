// /api/catalog/library — designer's own library (catalog products they've
// touched via items in any project). Distinct over catalog_product_id.
import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const { designerId } = await requireDesigner()
    const sp = req.nextUrl.searchParams
    const q = sp.get('q')?.trim() ?? null

    // Pull distinct catalog_product_ids from this designer's items, then
    // fetch the catalog rows. TODO: replace with a SQL view + index for
    // efficiency once we have meaningful library sizes.
    const { data: itemIds, error } = await supabaseAdmin()
      .from('items')
      .select('catalog_product_id')
      .eq('designer_id', designerId)
      .not('catalog_product_id', 'is', null)
    if (error) throw error

    const ids = Array.from(
      new Set((itemIds ?? []).map((r) => r.catalog_product_id).filter(Boolean)),
    ) as string[]
    if (!ids.length) return NextResponse.json({ data: [] })

    let query = supabaseAdmin()
      .from('catalog_products')
      .select('*')
      .in('id', ids)
      .order('updated_at', { ascending: false })

    if (q) query = query.or(`name.ilike.%${q}%,vendor.ilike.%${q}%`)

    const { data, error: e2 } = await query
    if (e2) throw e2
    return NextResponse.json({ data })
  })
}
