// /api/catalog — search the master catalog
import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'

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
      .order('clipped_count', { ascending: false })
      .limit(limit)

    if (q) {
      // Simple ILIKE search across name + vendor. TODO: switch to full-text
      // (tsvector) when the catalog grows.
      query = query.or(`name.ilike.%${q}%,vendor.ilike.%${q}%`)
    }
    if (vendor) query = query.ilike('vendor', vendor)
    if (category) query = query.ilike('category', category)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ data })
  })
}
