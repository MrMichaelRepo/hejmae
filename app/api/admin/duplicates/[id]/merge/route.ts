// POST /api/admin/duplicates/:id/merge
//
// Consolidates the removed product into the kept product atomically.
// The actual transaction lives in the Postgres function
// merge_catalog_duplicate(); this route validates input and forwards.

import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth/admin'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, badRequest, notFound } from '@/lib/errors'
import { mergeDuplicateInput } from '@/lib/validations/admin'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async () => {
    const ctx = await requireAdmin()
    const { id } = await params
    if (!id) throw badRequest('Missing flag id')

    const body = mergeDuplicateInput.parse(await req.json())

    const sb = supabaseAdmin()
    const { data: flag, error: flagErr } = await sb
      .from('catalog_duplicate_flags')
      .select('id, product_a_id, product_b_id, resolved')
      .eq('id', id)
      .maybeSingle()
    if (flagErr) throw flagErr
    if (!flag) throw notFound('Flag not found')

    const pair = new Set([flag.product_a_id, flag.product_b_id])
    if (
      !pair.has(body.keep_product_id) ||
      !pair.has(body.remove_product_id) ||
      body.keep_product_id === body.remove_product_id
    ) {
      throw badRequest('keep/remove pair does not match this flag')
    }

    const { data: keptId, error: mergeErr } = await sb.rpc(
      'merge_catalog_duplicate',
      {
        p_flag_id: id,
        p_keep_id: body.keep_product_id,
        p_remove_id: body.remove_product_id,
        p_resolver_id: ctx.adminUserId,
        p_notes: body.resolution_notes ?? null,
      },
    )
    if (mergeErr) {
      // The function raises clean exception messages on validation errors —
      // surface them as 400s rather than 500s.
      throw badRequest(mergeErr.message)
    }

    return NextResponse.json({
      data: { kept_product_id: keptId, flag_id: id },
      error: null,
    })
  })
}
