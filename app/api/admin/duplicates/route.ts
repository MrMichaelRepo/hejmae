// GET /api/admin/duplicates
//
// Paginated list of CatalogDuplicateFlag rows joined with both products
// and the resolving admin's name. Filtered primarily by resolved=true/false;
// when resolved=true an optional status sub-filter narrows to merged vs
// dismissed.

import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth/admin'
import { withErrorHandling, badRequest } from '@/lib/errors'
import { listDuplicateFlags } from '@/lib/admin/duplicates'

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    await requireAdmin()
    const sp = req.nextUrl.searchParams

    const resolvedRaw = sp.get('resolved')
    const resolved =
      resolvedRaw == null ? false : ['1', 'true', 'yes'].includes(resolvedRaw.toLowerCase())

    const statusRaw = sp.get('status')
    let status: 'confirmed_duplicate' | 'dismissed' | undefined
    if (statusRaw) {
      if (statusRaw !== 'confirmed_duplicate' && statusRaw !== 'dismissed') {
        throw badRequest(
          'status must be confirmed_duplicate or dismissed when set',
        )
      }
      status = statusRaw
    }

    const page = Number(sp.get('page') ?? '1') || 1
    const limit = Number(sp.get('limit') ?? '20') || 20

    const result = await listDuplicateFlags({ resolved, status, page, limit })
    return NextResponse.json({ data: result, error: null })
  })
}
