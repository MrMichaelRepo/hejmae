// POST /api/clippings/clip — entry-point for the Hejmae Clipper extension.
//
// Flow:
//   1. Auth (Clerk).
//   2. Validate it's a real product page (URL blocklist + HEAD + og/JSON-LD
//      sniff + price-pattern). Bounce non-products with 422 before we
//      write anything — that way we don't pollute the catalog with junk
//      and we don't burn the scraper on Reddit threads.
//   3. Dedup against this clipper's own non-deleted rows by source_url.
//      Return the existing record with message=already_saved.
//   4. Dedup against the master catalog by source_url. If found, copy
//      the catalog fields straight onto the new clipping_items row and
//      mark it complete — no scrape job needed.
//   5. Otherwise insert pending + fire the async scrape job.

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, badRequest } from '@/lib/errors'
import { clipUrlInput } from '@/lib/validations/clipping'
import { validateProductPage } from '@/lib/clippings/validate-product-page'
import { runScrape } from '@/lib/clippings/run-scrape'
import { isoWeekMonday } from '@/lib/clippings/week'

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    const body = clipUrlInput.parse(await req.json())

    // Project ownership check — refuse a project_id that doesn't belong
    // to the caller's studio.
    if (body.project_id) {
      const { data: project } = await supabaseAdmin()
        .from('projects')
        .select('id')
        .eq('id', body.project_id)
        .eq('designer_id', ctx.designerId)
        .maybeSingle()
      if (!project) {
        throw badRequest('project_id does not belong to this studio')
      }
    }

    // Step 2: product page gate. Must run before any DB write.
    const verdict = await validateProductPage(body.url, body.html)
    if (!verdict.ok) {
      return NextResponse.json(
        {
          data: null,
          error: {
            code: 'not_a_product_page',
            message: verdict.reason,
          },
        },
        { status: 422 },
      ) as NextResponse
    }

    const sb = supabaseAdmin()

    // Step 3: dedup against this user's own live rows. Match on
    // canonical_url first when the extension supplied one — catches
    // the "same product via two different ads" case where source_url
    // differs (gclid / utm). Fall back to source_url for clips that
    // don't have a canonical (e.g. captured from chrome:// pages where
    // the content-script couldn't run).
    let existing:
      | { id: string; scrape_status: string }
      | null = null

    if (body.canonical_url) {
      const { data } = await sb
        .from('clipping_items')
        .select('id, scrape_status')
        .eq('clipper_user_id', ctx.userId)
        .eq('canonical_url', body.canonical_url)
        .is('deleted_at', null)
        .maybeSingle()
      existing = data ?? null
    }

    if (!existing) {
      const { data } = await sb
        .from('clipping_items')
        .select('id, scrape_status')
        .eq('clipper_user_id', ctx.userId)
        .eq('source_url', body.url)
        .is('deleted_at', null)
        .maybeSingle()
      existing = data ?? null
    }

    if (existing) {
      return NextResponse.json({
        data: {
          clipping_item_id: existing.id,
          scrape_status: existing.scrape_status,
          message: 'already_saved',
        },
        error: null,
      })
    }

    // Step 4: catalog dedup by source_url. If we already know this
    // product, copy its fields onto the new clipping_items row instead
    // of re-scraping it. Prefer the page's <link rel="canonical"> when
    // present so two clicks on the same product via different ads
    // (different gclid / utm strings) collapse to one catalog row.
    const catalogUrl = body.canonical_url ?? body.url
    const { data: catalogMatch } = await sb
      .from('catalog_products')
      .select('id, name, vendor, image_url, retail_price_cents, clipped_count')
      .eq('source_url', catalogUrl)
      .is('merged_into_id', null)
      .is('deleted_at', null)
      .maybeSingle()

    const weekAdded = isoWeekMonday()

    const insertPayload: Record<string, unknown> = {
      designer_id: ctx.designerId,
      studio_id: ctx.studioId,
      clipper_user_id: ctx.userId,
      project_id: body.project_id ?? null,
      source_url: body.url,
      canonical_url: body.canonical_url ?? null,
      week_added: weekAdded,
      // Default — overwritten below if we have a catalog match.
      scrape_status: 'pending',
      catalog_product_id: catalogMatch?.id ?? null,
    }

    if (catalogMatch) {
      insertPayload.name = catalogMatch.name
      insertPayload.vendor = catalogMatch.vendor
      insertPayload.image_url = catalogMatch.image_url
      insertPayload.retail_price_cents = catalogMatch.retail_price_cents
      insertPayload.scrape_status = 'complete'
    } else if (body.page_title) {
      // Provisional name from the tab title so the card isn't blank
      // while the scrape is in flight.
      insertPayload.name = body.page_title.trim().slice(0, 300)
    }

    const { data: inserted, error: insertErr } = await sb
      .from('clipping_items')
      .insert(insertPayload)
      .select('id, scrape_status')
      .single()

    // 23505 = unique_violation. Happens when the same user fires two
    // concurrent clips of the same product (e.g. double-clicks Save)
    // and the dedup SELECT above missed the in-flight peer. Both
    // partial-unique indexes — (clipper_user_id, source_url) and
    // (clipper_user_id, canonical_url) — can trigger this. Re-select
    // the winner and return it as 'already_saved' instead of 500'ing.
    if (insertErr) {
      if (insertErr.code === '23505') {
        let winner:
          | { id: string; scrape_status: string }
          | null = null
        if (body.canonical_url) {
          const { data } = await sb
            .from('clipping_items')
            .select('id, scrape_status')
            .eq('clipper_user_id', ctx.userId)
            .eq('canonical_url', body.canonical_url)
            .is('deleted_at', null)
            .maybeSingle()
          winner = data ?? null
        }
        if (!winner) {
          const { data } = await sb
            .from('clipping_items')
            .select('id, scrape_status')
            .eq('clipper_user_id', ctx.userId)
            .eq('source_url', body.url)
            .is('deleted_at', null)
            .maybeSingle()
          winner = data ?? null
        }
        if (winner) {
          return NextResponse.json({
            data: {
              clipping_item_id: winner.id,
              scrape_status: winner.scrape_status,
              message: 'already_saved',
            },
            error: null,
          })
        }
      }
      throw insertErr
    }

    if (catalogMatch) {
      await sb
        .from('catalog_products')
        .update({ clipped_count: catalogMatch.clipped_count + 1 })
        .eq('id', catalogMatch.id)
    } else {
      // Fire-and-forget. We deliberately don't await so the response
      // returns immediately. runScrape() swallows errors and flips the
      // row to scrape_status='failed' on its own.
      void runScrape({
        clippingItemId: inserted.id,
        url: body.url,
        canonicalUrl: body.canonical_url ?? null,
        designerId: ctx.designerId,
        fallbackTitle: body.page_title ?? null,
        // Reuse the rendered HTML the extension already captured so
        // the scrape doesn't have to re-fetch (and possibly fail) the
        // page server-side. verdict.html falls back to the body html
        // when validation re-fetched it.
        html: verdict.html,
      })
    }

    return NextResponse.json(
      {
        data: {
          clipping_item_id: inserted.id,
          scrape_status: inserted.scrape_status,
        },
        error: null,
      },
      { status: 201 },
    )
  })
}
