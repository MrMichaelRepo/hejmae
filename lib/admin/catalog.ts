// Server-side helpers for /admin/catalog management. Centralizes the
// listing query so the page and the API stay in sync, and exposes a
// "load with unresolved-flag count" helper used by the table view.

import { supabaseAdmin } from '@/lib/supabase/server'
import { sanitizePostgrestSearch } from '@/lib/postgrest'
import { withSignedUrlsList } from '@/lib/storage'
import { CATALOG_PRODUCT_ADMIN_COLUMNS } from '@/lib/catalog/columns'
import type { CatalogProductRow } from '@/lib/supabase/types'

export interface AdminCatalogParams {
  q?: string | null
  vendor?: string | null
  item_type?: string | null
  has_image?: 'yes' | 'no' | null
  has_price?: 'yes' | 'no' | null
  include_merged?: boolean
  flagged?: 'yes' | 'no' | null
  page: number
  limit: number
}

export interface AdminCatalogRow
  extends Omit<CatalogProductRow, 'embedding'> {
  has_embedding: boolean
  unresolved_flag_count: number
  merged_into_name: string | null
}

export interface AdminCatalogResult {
  items: AdminCatalogRow[]
  total: number
  page: number
  limit: number
}

export async function listAdminCatalog(
  params: AdminCatalogParams,
): Promise<AdminCatalogResult> {
  const sb = supabaseAdmin()
  const page = Math.max(1, params.page)
  const limit = Math.min(Math.max(1, params.limit), 200)
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = sb
    .from('catalog_products')
    .select(CATALOG_PRODUCT_ADMIN_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)
    .is('deleted_at', null)

  if (!params.include_merged) {
    query = query.is('merged_into_id', null)
  }

  if (params.q) {
    const safe = sanitizePostgrestSearch(params.q)
    if (safe) {
      const escaped = safe.replace(/%/g, '')
      query = query.or(
        [
          `name.ilike.%${escaped}%`,
          `vendor.ilike.%${escaped}%`,
          `source_url.ilike.%${escaped}%`,
          `description.ilike.%${escaped}%`,
        ].join(','),
      )
    }
  }
  if (params.vendor) query = query.ilike('vendor', params.vendor)
  if (params.item_type) query = query.ilike('item_type', params.item_type)
  if (params.has_image === 'yes') query = query.not('image_url', 'is', null)
  if (params.has_image === 'no') query = query.is('image_url', null)
  if (params.has_price === 'yes')
    query = query.not('retail_price_cents', 'is', null)
  if (params.has_price === 'no') query = query.is('retail_price_cents', null)

  const { data, error, count } = await query
  if (error) throw error

  type Raw = Omit<CatalogProductRow, 'embedding'> & {
    embedding_updated_at: string | null
  }
  const rows = (data ?? []) as Raw[]

  // Look up merged-into names + unresolved-flag counts in batch.
  const mergedIntoIds = Array.from(
    new Set(
      rows
        .map((r) => r.merged_into_id)
        .filter((v): v is string => !!v),
    ),
  )
  const rowIds = rows.map((r) => r.id)

  const [{ data: targets }, { data: flagRows }] = await Promise.all([
    mergedIntoIds.length > 0
      ? sb
          .from('catalog_products')
          .select('id, name')
          .in('id', mergedIntoIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    rowIds.length > 0
      ? sb
          .from('catalog_duplicate_flags')
          .select('product_a_id, product_b_id')
          .eq('resolved', false)
          .or(
            `product_a_id.in.(${rowIds.join(',')}),product_b_id.in.(${rowIds.join(',')})`,
          )
      : Promise.resolve({
          data: [] as { product_a_id: string; product_b_id: string }[],
        }),
  ])
  const targetById = new Map(
    (targets ?? []).map((t) => [t.id as string, t.name as string]),
  )
  const flagCount = new Map<string, number>()
  for (const f of flagRows ?? []) {
    flagCount.set(f.product_a_id, (flagCount.get(f.product_a_id) ?? 0) + 1)
    flagCount.set(f.product_b_id, (flagCount.get(f.product_b_id) ?? 0) + 1)
  }

  let hydrated: AdminCatalogRow[] = rows.map((r) => ({
    ...r,
    has_embedding: r.embedding_updated_at != null,
    unresolved_flag_count: flagCount.get(r.id) ?? 0,
    merged_into_name: r.merged_into_id
      ? (targetById.get(r.merged_into_id) ?? null)
      : null,
  }))

  if (params.flagged === 'yes') {
    hydrated = hydrated.filter((r) => r.unresolved_flag_count > 0)
  } else if (params.flagged === 'no') {
    hydrated = hydrated.filter((r) => r.unresolved_flag_count === 0)
  }

  const signed = await withSignedUrlsList(hydrated, 'image_url')
  return {
    items: signed,
    total: count ?? 0,
    page,
    limit,
  }
}
