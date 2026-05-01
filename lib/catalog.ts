// Catalog write-on-add: when a designer creates an item from scratch, we
// silently materialize a CatalogProduct so the master library grows over
// time. This must NEVER surface a "save to catalog?" prompt to the user.
//
// Dedup priority:
//   1. source_url match  → reuse + bump clipped_count
//   2. (lower(vendor), lower(name)) match → reuse + bump
//   3. otherwise insert a new catalog product
//
// All operations use the service role; no RLS interaction.

import { supabaseAdmin } from '@/lib/supabase/server'
import type { CatalogProductRow } from '@/lib/supabase/types'

export interface CatalogClipInput {
  name: string
  vendor: string | null
  image_url: string | null
  source_url: string | null
  retail_price_cents: number | null
  designerId: string
}

export async function upsertCatalogProduct(
  input: CatalogClipInput,
): Promise<CatalogProductRow> {
  const sb = supabaseAdmin()

  if (input.source_url) {
    const { data: existing, error } = await sb
      .from('catalog_products')
      .select('*')
      .eq('source_url', input.source_url)
      .maybeSingle()
    if (error) throw error
    if (existing) {
      const { data: bumped, error: e2 } = await sb
        .from('catalog_products')
        .update({
          clipped_count: existing.clipped_count + 1,
          // Refresh retail price if the new clip carries one.
          ...(input.retail_price_cents != null
            ? {
                retail_price_cents: input.retail_price_cents,
                retail_price_last_seen_at: new Date().toISOString(),
              }
            : {}),
        })
        .eq('id', existing.id)
        .select()
        .single()
      if (e2) throw e2
      return bumped as CatalogProductRow
    }
  }

  if (input.vendor) {
    const { data: existingByVendor, error } = await sb
      .from('catalog_products')
      .select('*')
      .ilike('vendor', input.vendor)
      .ilike('name', input.name)
      .maybeSingle()
    if (error) throw error
    if (existingByVendor) {
      const { data: bumped, error: e2 } = await sb
        .from('catalog_products')
        .update({ clipped_count: existingByVendor.clipped_count + 1 })
        .eq('id', existingByVendor.id)
        .select()
        .single()
      if (e2) throw e2
      return bumped as CatalogProductRow
    }
  }

  const { data: created, error: e3 } = await sb
    .from('catalog_products')
    .insert({
      name: input.name,
      vendor: input.vendor,
      image_url: input.image_url,
      source_url: input.source_url,
      retail_price_cents: input.retail_price_cents,
      retail_price_last_seen_at:
        input.retail_price_cents != null ? new Date().toISOString() : null,
      created_by: input.designerId,
      clipped_count: 1,
    })
    .select()
    .single()
  if (e3) throw e3
  return created as CatalogProductRow
}
