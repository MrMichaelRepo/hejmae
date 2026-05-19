// GET /api/admin/catalog
//
// Paginated catalog management list with full-text-ish search and
// filter facets. Returns row + flag-status badges + merged-target name.

import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth/admin'
import { withErrorHandling } from '@/lib/errors'
import { listAdminCatalog } from '@/lib/admin/catalog'

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    await requireAdmin()
    const sp = req.nextUrl.searchParams

    const trinary = (key: string): 'yes' | 'no' | null => {
      const v = sp.get(key)
      if (v === 'yes') return 'yes'
      if (v === 'no') return 'no'
      return null
    }

    const result = await listAdminCatalog({
      q: sp.get('q'),
      vendor: sp.get('vendor'),
      item_type: sp.get('item_type'),
      has_image: trinary('has_image'),
      has_price: trinary('has_price'),
      include_merged: sp.get('include_merged') === 'true',
      flagged: trinary('flagged'),
      page: Number(sp.get('page') ?? '1') || 1,
      limit: Number(sp.get('limit') ?? '50') || 50,
    })

    return NextResponse.json({ data: result, error: null })
  })
}
