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
import { generateCatalogEmbedding } from '@/lib/catalog/embed'

const USER_AGENT =
  'Mozilla/5.0 (compatible; HejmaeClipper/1.0; +https://hejmae.com/clipper)'

export interface RunScrapeInput {
  clippingItemId: string
  url: string
  designerId: string
  fallbackTitle?: string | null
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
  const html = await fetchHtml(input.url)
  if (!html) {
    await supabaseAdmin()
      .from('clipping_items')
      .update({ scrape_status: 'failed' })
      .eq('id', input.clippingItemId)
    return
  }

  const scraped = scrapeProductHtml(html, input.url, input.fallbackTitle)
  // Ensure we always end with *some* name + vendor so the card isn't blank.
  const name = scraped.name ?? input.fallbackTitle ?? input.url
  const vendor = scraped.vendor ?? vendorFromHostname(input.url)

  // Catalog dedup — same shape as upsertCatalogProduct but inlined so we
  // can write the catalog_product_id back onto the clipping in one shot.
  const sb = supabaseAdmin()
  let catalogProductId: string | null = null

  const { data: existingCatalog } = await sb
    .from('catalog_products')
    .select('id, clipped_count, retail_price_cents')
    .eq('source_url', input.url)
    .maybeSingle()

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
  } else {
    const { data: created } = await sb
      .from('catalog_products')
      .insert({
        name,
        vendor,
        image_url: scraped.image_url,
        source_url: input.url,
        retail_price_cents: scraped.retail_price_cents,
        retail_price_last_seen_at:
          scraped.retail_price_cents != null ? new Date().toISOString() : null,
        created_by: input.designerId,
        clipped_count: 1,
      })
      .select('id')
      .single()
    if (created) {
      catalogProductId = created.id
      void generateCatalogEmbedding(created.id)
    }
  }

  await sb
    .from('clipping_items')
    .update({
      name,
      vendor,
      image_url: scraped.image_url,
      retail_price_cents: scraped.retail_price_cents,
      description: scraped.description,
      item_type: scraped.item_type,
      catalog_product_id: catalogProductId,
      scrape_status: 'complete',
    })
    .eq('id', input.clippingItemId)
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
