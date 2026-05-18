// Brand / vendor picklists for the AI verifier.
//
// The point: when the AI is naming the brand/vendor of a freshly
// clipped product, we want it to *reuse* the spelling that already
// exists in the catalog rather than coining a new variant. Otherwise
// "Rejuvenation", "Rejuvenation, Inc.", and "rejuvenation.com" all end
// up as distinct catalog values and the designer's "all Rejuvenation
// products" filter is broken.
//
// Returned lists are ranked by total clipped_count, so the AI sees the
// most-used canonical spellings first. We fetch a bounded window of
// catalog rows and aggregate in JS — fine for the catalog sizes we
// expect (low thousands); revisit with an RPC / materialized view if
// this query starts to dominate p95.

import { supabaseAdmin } from '@/lib/supabase/server'

const MAX_FETCH = 5000
const TOP_N = 200

export interface CatalogPicklists {
  brands: string[]
  vendors: string[]
}

export async function getCatalogPicklists(): Promise<CatalogPicklists> {
  const sb = supabaseAdmin()
  const { data, error } = await sb
    .from('catalog_products')
    .select('brand, vendor, clipped_count')
    .is('merged_into_id', null)
    .is('deleted_at', null)
    .order('clipped_count', { ascending: false })
    .limit(MAX_FETCH)

  if (error || !data) {
    if (error) {
      console.error('[catalog.picklists] fetch failed', error)
    }
    return { brands: [], vendors: [] }
  }

  const brandWeights = new Map<string, number>()
  const vendorWeights = new Map<string, number>()
  for (const row of data) {
    const w = row.clipped_count ?? 1
    if (row.brand) {
      brandWeights.set(row.brand, (brandWeights.get(row.brand) ?? 0) + w)
    }
    if (row.vendor) {
      vendorWeights.set(row.vendor, (vendorWeights.get(row.vendor) ?? 0) + w)
    }
  }

  const topByWeight = (m: Map<string, number>): string[] =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_N)
      .map(([k]) => k)

  return {
    brands: topByWeight(brandWeights),
    vendors: topByWeight(vendorWeights),
  }
}
