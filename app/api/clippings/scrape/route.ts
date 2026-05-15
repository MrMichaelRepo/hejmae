// POST /api/clippings/scrape — internal scrape entrypoint.
//
// Two callers:
//   * The clip route uses runScrape() directly (in-process) for the
//     hot path. This route is the HTTP fallback for spec compliance
//     and manual retry from the UI.
//
// Auth: requires Clerk auth. The caller's designerId must match the
// clipping_items.designer_id of the target row — that prevents one
// studio from forcing scrapes on another studio's rows.

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, forbidden, notFound } from '@/lib/errors'
import { internalScrapeInput } from '@/lib/validations/clipping'
import { runScrape } from '@/lib/clippings/run-scrape'

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    const body = internalScrapeInput.parse(await req.json())

    if (body.designer_id !== ctx.designerId) {
      throw forbidden('designer_id mismatch')
    }

    const { data: row } = await supabaseAdmin()
      .from('clipping_items')
      .select('id, designer_id, source_url')
      .eq('id', body.clipping_item_id)
      .is('deleted_at', null)
      .maybeSingle()
    if (!row) throw notFound('Clipping not found')
    if (row.designer_id !== ctx.designerId) throw forbidden('Not your clipping')

    // Reset to pending so the UI knows we're working on it again.
    await supabaseAdmin()
      .from('clipping_items')
      .update({ scrape_status: 'pending' })
      .eq('id', row.id)

    void runScrape({
      clippingItemId: row.id,
      url: row.source_url,
      designerId: ctx.designerId,
    })

    return NextResponse.json({
      data: { clipping_item_id: row.id },
      error: null,
    })
  })
}
