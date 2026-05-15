// POST /api/admin/catalog/flag-duplicate
//
// Manually flags a pair of catalog products as a probable duplicate.
// Admin-only entry point that complements the automated weekly scan.
// Always inserts with similarity_score = null and match_reasons =
// ['manual_flag'].

import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth/admin'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, badRequest } from '@/lib/errors'
import { flagDuplicateInput } from '@/lib/validations/admin'

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    await requireAdmin()
    const body = flagDuplicateInput.parse(await req.json())

    // Lexicographic ordering. The DB trigger also enforces this, but the
    // route does it explicitly so the read-back below uses the same keys.
    const pair =
      body.product_a_id < body.product_b_id
        ? { a: body.product_a_id, b: body.product_b_id }
        : { a: body.product_b_id, b: body.product_a_id }

    const sb = supabaseAdmin()

    // Refuse if either product is gone / merged / deleted.
    const { data: products, error: prodErr } = await sb
      .from('catalog_products')
      .select('id, merged_into_id, deleted_at')
      .in('id', [pair.a, pair.b])
    if (prodErr) throw prodErr
    if (!products || products.length !== 2) {
      throw badRequest('One or both products do not exist')
    }
    for (const p of products) {
      if (p.merged_into_id || p.deleted_at) {
        throw badRequest('Cannot flag a merged or deleted product')
      }
    }

    // If an unresolved flag exists, hand it back rather than racing the
    // partial unique index.
    const { data: existing, error: lookupErr } = await sb
      .from('catalog_duplicate_flags')
      .select('id')
      .eq('product_a_id', pair.a)
      .eq('product_b_id', pair.b)
      .eq('resolved', false)
      .maybeSingle()
    if (lookupErr) throw lookupErr
    if (existing) {
      return NextResponse.json({
        data: { flag_id: existing.id, message: 'already_flagged' },
        error: null,
      })
    }

    // Insert a fresh manual flag. A previously-resolved flag for the same
    // pair is fine — admin is intentionally overriding past resolution.
    const { data: inserted, error } = await sb
      .from('catalog_duplicate_flags')
      .insert({
        product_a_id: pair.a,
        product_b_id: pair.b,
        similarity_score: null,
        match_reasons: ['manual_flag'],
        status: 'pending',
        resolved: false,
      })
      .select('id')
      .single()
    if (error) throw error

    return NextResponse.json({
      data: { flag_id: inserted.id, message: 'flagged' },
      error: null,
    })
  })
}
