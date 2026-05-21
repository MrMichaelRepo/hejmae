// Background scrape job for a single clipping_items row. Used by:
//   * /api/clippings/clip — fired-and-forgotten after the row is inserted
//     (so the HTTP response returns immediately).
//   * /api/clippings/scrape — exposed as an HTTP entry-point for spec
//     compliance and manual retry.
//
// Pipeline (per call):
//   1. Deterministic scrape: JSON-LD / __NEXT_DATA__ / OG meta /
//      microdata. Produces a baseline ScrapedProduct + harvested image
//      URL candidates.
//   2. Catalog picklists: fetch existing brand and vendor spellings so
//      the AI can reuse them and we don't fork "Rejuvenation" into
//      three variants.
//   3. AI verifier (Haiku): given baseline + candidates + picklists,
//      confirms or corrects every field and tags each with a
//      confidence flag. Always runs when ANTHROPIC_API_KEY is set.
//   4. Merge: AI high-confidence wins (even when null — that's an
//      authoritative "field doesn't apply"); deterministic baseline
//      wins when AI is uncertain; AI low-confidence fills only when
//      deterministic was null.
//   5. Catalog upsert + image persistence, then writeback to clipping_items.
//
// All errors are caught and converted to scrape_status = 'failed' on
// the row. We never let this throw — the caller doesn't await it.

import { supabaseAdmin } from '@/lib/supabase/server'
import { scrapeProductHtml, vendorFromHostname, type ScrapedProduct } from './scrape'
import {
  aiExtractProduct,
  type AiExtractedProduct,
  type AiField,
} from './ai-extract'
import { getCatalogPicklists } from '@/lib/catalog/picklists'
import { persistCatalogImage } from './persist-image'
import { generateCatalogEmbedding } from '@/lib/catalog/embed'

const USER_AGENT =
  'Mozilla/5.0 (compatible; hejmaeClipper/1.0; +https://hejmae.com/clipper)'

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

  const { product: baseline, candidates } = scrapeProductHtml(
    html,
    input.url,
    input.fallbackTitle,
  )

  // Catalog picklists are an input to the AI call, so they have to
  // resolve first. Cheap query in practice (bounded fetch +
  // in-process aggregate) — not worth the complexity of trying to
  // parallelize against the AI roundtrip.
  const picklists = await getCatalogPicklists()
  const aiResult = await aiExtractProduct({
    url: input.url,
    html,
    baseline,
    candidates,
    existingBrands: picklists.brands,
    existingVendors: picklists.vendors,
  })

  const scraped = mergeWithAi(baseline, aiResult)

  console.log(
    '[clippings.scrape]',
    JSON.stringify({
      clipping_item_id: input.clippingItemId,
      url: input.url,
      baseline: snapshot(baseline),
      candidates_counts: {
        image_urls: candidates.image_urls.length,
        existing_brands: picklists.brands.length,
        existing_vendors: picklists.vendors.length,
      },
      ai_ran: aiResult != null,
      final: snapshot(scraped),
    }),
  )

  // Ensure we always end with *some* name + vendor so cards / POs
  // aren't blank. brand stays whatever was merged — null is fine.
  const name = scraped.name ?? input.fallbackTitle ?? input.url
  const brand = scraped.brand
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
    .select(
      'id, clipped_count, retail_price_cents, image_url, item_type, material, style_tag, brand, vendor',
    )
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
    // Backfill catalog item_type / material / style_tag / brand /
    // vendor when the existing row was missing them and this scrape
    // produced values (e.g. legacy rows from before later columns
    // existed).
    if (existingCatalog.item_type == null && scraped.item_type != null) {
      update.item_type = scraped.item_type
    }
    if (existingCatalog.material == null && scraped.material != null) {
      update.material = scraped.material
    }
    if (existingCatalog.style_tag == null && scraped.style_tag != null) {
      update.style_tag = scraped.style_tag
    }
    if (existingCatalog.brand == null && scraped.brand != null) {
      update.brand = scraped.brand
    }
    if (existingCatalog.vendor == null && scraped.vendor != null) {
      update.vendor = scraped.vendor
    }
    await sb.from('catalog_products').update(update).eq('id', existingCatalog.id)

    // Adopt the catalog's normalized labels onto this clipping. The
    // catalog row is the source of truth — repeat clips share its
    // item_type / material / style_tag / brand rather than re-running
    // the AI.
    scraped.item_type = existingCatalog.item_type ?? scraped.item_type
    scraped.material = existingCatalog.material ?? scraped.material
    scraped.style_tag = existingCatalog.style_tag ?? scraped.style_tag
    scraped.brand = existingCatalog.brand ?? scraped.brand

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
        brand,
        vendor,
        image_url: scraped.image_url,
        source_url: catalogUrl,
        retail_price_cents: scraped.retail_price_cents,
        retail_price_last_seen_at:
          scraped.retail_price_cents != null ? new Date().toISOString() : null,
        item_type: scraped.item_type,
        material: scraped.material,
        style_tag: scraped.style_tag,
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
        .select('id, clipped_count, image_url, item_type, material, style_tag, brand')
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
        scraped.item_type = winner.item_type ?? scraped.item_type
        scraped.material = winner.material ?? scraped.material
        scraped.style_tag = winner.style_tag ?? scraped.style_tag
        scraped.brand = winner.brand ?? scraped.brand
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

  const { data: updated } = await sb
    .from('clipping_items')
    .update({
      name,
      brand: scraped.brand,
      image_url: finalImageUrl,
      retail_price_cents: scraped.retail_price_cents,
      description: scraped.description,
      item_type: scraped.item_type,
      material: scraped.material,
      style_tag: scraped.style_tag,
      catalog_product_id: catalogProductId,
      scrape_status: 'complete',
    })
    .eq('id', input.clippingItemId)
    .select('deleted_at, catalog_product_id')
    .maybeSingle()

  // If the user deleted this clipping while the scrape was in flight,
  // the DELETE route soft-deleted it (catalog_product_id was null at
  // that moment). Now that the catalog row exists, the soft-deleted
  // clipping is the same "stored in two places" case the DELETE route
  // already hard-deletes for. Promote it to a hard delete to keep the
  // invariant.
  if (updated?.deleted_at && updated.catalog_product_id) {
    await sb
      .from('clipping_items')
      .delete()
      .eq('id', input.clippingItemId)
  }
}

// Merge rules per field:
//   * AI high-confidence wins (even when null — that's an
//     authoritative "this field doesn't apply" or "the deterministic
//     baseline was wrong and I don't know the right answer").
//   * AI low-confidence + deterministic baseline → keep baseline.
//   * AI low-confidence + no baseline → keep AI's low-confidence guess
//     as a fallback (better than blank).
//   * No AI at all → keep baseline.
function mergeWithAi(
  baseline: ScrapedProduct,
  ai: AiExtractedProduct | null,
): ScrapedProduct {
  if (!ai) return { ...baseline }
  return {
    name: pickField(baseline.name, ai.name),
    brand: pickField(baseline.brand, ai.brand),
    vendor: pickField(baseline.vendor, ai.vendor),
    image_url: pickField(baseline.image_url, ai.image_url),
    retail_price_cents: pickField(baseline.retail_price_cents, ai.retail_price_cents),
    description: pickField(baseline.description, ai.description),
    item_type: pickField(baseline.item_type, ai.item_type),
    // material and style_tag have no deterministic source — only the
    // AI can fill them. pickField still works: baseline is always null.
    material: pickField(baseline.material, ai.material),
    style_tag: pickField(baseline.style_tag, ai.style_tag),
  }
}

function pickField<T>(baseline: T | null, ai: AiField<T>): T | null {
  if (ai.confidence === 'high') return ai.value
  return baseline ?? ai.value
}

// Compact boolean snapshot of which fields are populated. Used in the
// scrape log so you can answer "which layer filled which field?" by
// grepping for [clippings.scrape].
function snapshot(s: ScrapedProduct): Record<string, boolean> {
  return {
    name: s.name != null,
    brand: s.brand != null,
    vendor: s.vendor != null,
    image_url: s.image_url != null,
    retail_price_cents: s.retail_price_cents != null,
    description: s.description != null,
    item_type: s.item_type != null,
    material: s.material != null,
    style_tag: s.style_tag != null,
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
