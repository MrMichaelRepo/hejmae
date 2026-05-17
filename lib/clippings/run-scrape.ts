// Background scrape job for a single clipping_items row. Used by:
//   * /api/clippings/clip — fired-and-forgotten after the row is inserted
//     (so the HTTP response returns immediately).
//   * /api/clippings/scrape — exposed as an HTTP entry-point for spec
//     compliance and manual retry.
//
// All errors are caught and converted to scrape_status = 'failed' on the
// row. We never let this throw — the caller doesn't await it.

import { supabaseAdmin } from '@/lib/supabase/server'
import { scrapeProductHtml, vendorFromHostname } from './scrape'
import { aiExtractProduct } from './ai-extract'
import { persistCatalogImage } from './persist-image'
import { generateCatalogEmbedding } from '@/lib/catalog/embed'

const USER_AGENT =
  'Mozilla/5.0 (compatible; HejmaeClipper/1.0; +https://hejmae.com/clipper)'

export interface RunScrapeInput {
  clippingItemId: string
  url: string
  // <link rel="canonical"> from the rendered page. When present, it
  // (not `url`) is the catalog dedup / insert key — so the same product
  // clipped via different ad URLs collapses to one catalog row.
  canonicalUrl?: string | null
  designerId: string
  fallbackTitle?: string | null
  // Rendered DOM captured by the extension. When present, we skip the
  // server-side re-fetch (which fails on bot-protected or SPA sites).
  html?: string | null
}

export async function runScrape(input: RunScrapeInput): Promise<void> {
  try {
    await runScrapeInner(input)
  } catch (err) {
    console.error('[clippings.runScrape] failed', input.clippingItemId, err)
    try {
      await supabaseAdmin()
        .from('clipping_items')
        .update({ scrape_status: 'failed' })
        .eq('id', input.clippingItemId)
    } catch (e2) {
      console.error('[clippings.runScrape] also failed to mark failed', e2)
    }
  }
}

async function runScrapeInner(input: RunScrapeInput): Promise<void> {
  const html = input.html ?? (await fetchHtml(input.url))
  if (!html) {
    await supabaseAdmin()
      .from('clipping_items')
      .update({ scrape_status: 'failed' })
      .eq('id', input.clippingItemId)
    return
  }

  let scraped = scrapeProductHtml(html, input.url, input.fallbackTitle)
  const detBefore = snapshot(scraped)
  let aiCalled = false
  let aiFilled: string[] = []

  // AI fallback: when the deterministic scrape couldn't find image OR
  // price, ask Claude to extract from the rendered HTML. Soft-fails
  // (returns null) if ANTHROPIC_API_KEY isn't set or the model misfires
  // — we just keep whatever the deterministic pass found.
  if (scraped.image_url == null || scraped.retail_price_cents == null) {
    aiCalled = true
    const ai = await aiExtractProduct(html, input.url)
    if (ai) {
      const merged = {
        name: scraped.name ?? ai.name,
        vendor: scraped.vendor ?? ai.vendor,
        image_url: scraped.image_url ?? ai.image_url,
        retail_price_cents: scraped.retail_price_cents ?? ai.retail_price_cents,
        description: scraped.description ?? ai.description,
        item_type: scraped.item_type,
      }
      aiFilled = (['name', 'vendor', 'image_url', 'retail_price_cents', 'description'] as const)
        .filter((k) => detBefore[k] == null && merged[k] != null)
      scraped = merged
    }
  }

  console.log(
    '[clippings.scrape]',
    JSON.stringify({
      clipping_item_id: input.clippingItemId,
      url: input.url,
      deterministic: detBefore,
      ai_called: aiCalled,
      ai_filled: aiFilled,
    }),
  )

  // Ensure we always end with *some* name + vendor so the card isn't blank.
  const name = scraped.name ?? input.fallbackTitle ?? input.url
  const vendor = scraped.vendor ?? vendorFromHostname(input.url)

  // Catalog dedup — same shape as upsertCatalogProduct but inlined so we
  // can write the catalog_product_id back onto the clipping in one shot.
  // Prefer canonicalUrl over the clicked URL so ad/tracking variants
  // collapse to a single catalog row.
  const sb = supabaseAdmin()
  let catalogProductId: string | null = null
  const catalogUrl = input.canonicalUrl ?? input.url

  const { data: existingCatalog } = await sb
    .from('catalog_products')
    .select('id, clipped_count, retail_price_cents, image_url')
    .eq('source_url', catalogUrl)
    .is('merged_into_id', null)
    .is('deleted_at', null)
    .maybeSingle()

  // Image_url that we'll ultimately persist on the clipping. Defaults
  // to the scraped URL; gets overwritten with our storage path if we
  // can pull the bytes successfully.
  let finalImageUrl: string | null = scraped.image_url

  if (existingCatalog) {
    catalogProductId = existingCatalog.id
    const update: Record<string, unknown> = {
      clipped_count: existingCatalog.clipped_count + 1,
    }
    if (
      scraped.retail_price_cents != null &&
      scraped.retail_price_cents !== existingCatalog.retail_price_cents
    ) {
      update.retail_price_cents = scraped.retail_price_cents
      update.retail_price_last_seen_at = new Date().toISOString()
    }
    await sb.from('catalog_products').update(update).eq('id', existingCatalog.id)

    // Catalog hit: prefer the already-stored asset over a fresh download.
    // This is what makes the second+ clip of the same product instant.
    // Only persist the bytes if the catalog row doesn't have an image
    // yet (e.g. legacy row from before this pipeline existed).
    if (existingCatalog.image_url) {
      finalImageUrl = existingCatalog.image_url
    } else if (scraped.image_url) {
      const path = await persistCatalogImage(scraped.image_url, existingCatalog.id)
      if (path) {
        await sb.from('catalog_products').update({ image_url: path }).eq('id', existingCatalog.id)
        finalImageUrl = path
      }
    }
  } else {
    const { data: created, error: insertErr } = await sb
      .from('catalog_products')
      .insert({
        name,
        vendor,
        image_url: scraped.image_url,
        source_url: catalogUrl,
        retail_price_cents: scraped.retail_price_cents,
        retail_price_last_seen_at:
          scraped.retail_price_cents != null ? new Date().toISOString() : null,
        created_by: input.designerId,
        clipped_count: 1,
      })
      .select('id')
      .single()

    if (insertErr) {
      // Almost certainly a unique(source_url) violation from a
      // concurrent first-time scrape of the same canonical URL — both
      // workers saw an empty catalog above, both raced to insert. The
      // loser absorbs the winner's row: bump its clipped_count, adopt
      // its image, link our clipping. We don't try to refresh price /
      // re-upload the image — the winner's pass is responsible for
      // those.
      const { data: winner } = await sb
        .from('catalog_products')
        .select('id, clipped_count, image_url')
        .eq('source_url', catalogUrl)
        .is('merged_into_id', null)
        .is('deleted_at', null)
        .maybeSingle()
      if (winner) {
        catalogProductId = winner.id
        await sb
          .from('catalog_products')
          .update({ clipped_count: winner.clipped_count + 1 })
          .eq('id', winner.id)
        if (winner.image_url) finalImageUrl = winner.image_url
      } else {
        console.error(
          '[clippings.runScrape] catalog insert failed but no existing row found',
          { catalogUrl, insertErr },
        )
      }
    } else if (created) {
      catalogProductId = created.id
      void generateCatalogEmbedding(created.id)

      // Download → encode → upload → swap URL for storage path. Soft-
      // fails: on any error we leave catalog_products.image_url as the
      // original vendor URL, which resolveAssetUrl returns as-is. The
      // dashboard keeps working; we just don't own the bytes yet.
      if (scraped.image_url) {
        const path = await persistCatalogImage(scraped.image_url, created.id)
        if (path) {
          await sb.from('catalog_products').update({ image_url: path }).eq('id', created.id)
          finalImageUrl = path
        }
      }
    }
  }

  await sb
    .from('clipping_items')
    .update({
      name,
      vendor,
      image_url: finalImageUrl,
      retail_price_cents: scraped.retail_price_cents,
      description: scraped.description,
      item_type: scraped.item_type,
      catalog_product_id: catalogProductId,
      scrape_status: 'complete',
    })
    .eq('id', input.clippingItemId)
}

// Compact boolean snapshot of which fields the deterministic scraper
// produced. Lives in scrape logs so you can answer "did this clip
// trigger Claude, and which fields did it backfill?" by grepping
// Vercel function logs for [clippings.scrape].
function snapshot(s: {
  name: string | null
  vendor: string | null
  image_url: string | null
  retail_price_cents: number | null
  description: string | null
}): Record<string, boolean> {
  return {
    name: s.name != null,
    vendor: s.vendor != null,
    image_url: s.image_url != null,
    retail_price_cents: s.retail_price_cents != null,
    description: s.description != null,
  }
}

async function fetchHtml(url: string): Promise<string | null> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 15_000)
  try {
    const r = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: ac.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
      },
    })
    if (!r.ok) return null
    return await r.text()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
