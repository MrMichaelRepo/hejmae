// Server-side helpers shared by the admin duplicates routes and the
// /admin/duplicates server page. Centralizes the "load flags with both
// products joined and image URLs signed" query so the page and the API
// agree on shape.

import { supabaseAdmin } from '@/lib/supabase/server'
import { withSignedUrlsList } from '@/lib/storage'
import { CATALOG_PRODUCT_COLUMNS as CATALOG_PRODUCT_COLUMNS_LOCAL } from '@/lib/catalog/columns'
import type {
  CatalogDuplicateFlagRow,
  CatalogProductRow,
} from '@/lib/supabase/types'

export interface PublicCatalogProduct
  extends Omit<CatalogProductRow, 'embedding' | 'embedding_updated_at'> {}

export interface DuplicateFlagWithProducts {
  flag: CatalogDuplicateFlagRow
  product_a: PublicCatalogProduct | null
  product_b: PublicCatalogProduct | null
  resolved_by_name: string | null
}

export interface ListDuplicatesParams {
  resolved: boolean
  status?: 'confirmed_duplicate' | 'dismissed'
  page: number
  limit: number
}

export interface ListDuplicatesResult {
  items: DuplicateFlagWithProducts[]
  total: number
  page: number
  limit: number
}

export async function listDuplicateFlags(
  params: ListDuplicatesParams,
): Promise<ListDuplicatesResult> {
  const sb = supabaseAdmin()
  const page = Math.max(1, params.page)
  const limit = Math.min(Math.max(1, params.limit), 100)
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = sb
    .from('catalog_duplicate_flags')
    .select('*', { count: 'exact' })
    .eq('resolved', params.resolved)
    .order('flagged_at', { ascending: false })
    .range(from, to)

  if (params.resolved && params.status) {
    query = query.eq('status', params.status)
  }

  const { data: flags, error, count } = await query
  if (error) throw error

  const flagRows = (flags ?? []) as CatalogDuplicateFlagRow[]
  const items = await hydrateFlags(flagRows)
  return {
    items,
    total: count ?? 0,
    page,
    limit,
  }
}

export async function loadDuplicateFlag(
  id: string,
): Promise<DuplicateFlagWithProducts | null> {
  const sb = supabaseAdmin()
  const { data, error } = await sb
    .from('catalog_duplicate_flags')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const [hydrated] = await hydrateFlags([data as CatalogDuplicateFlagRow])
  return hydrated ?? null
}

async function hydrateFlags(
  flags: CatalogDuplicateFlagRow[],
): Promise<DuplicateFlagWithProducts[]> {
  if (flags.length === 0) return []
  const sb = supabaseAdmin()

  const productIds = Array.from(
    new Set(flags.flatMap((f) => [f.product_a_id, f.product_b_id])),
  )
  const resolverIds = Array.from(
    new Set(flags.map((f) => f.resolved_by).filter((v): v is string => !!v)),
  )

  const [{ data: productsRaw, error: pErr }, { data: usersRaw }] =
    await Promise.all([
      sb
        .from('catalog_products')
        .select(CATALOG_PRODUCT_COLUMNS_LOCAL)
        .in('id', productIds),
      resolverIds.length > 0
        ? sb.from('users').select('id, name, email').in('id', resolverIds)
        : Promise.resolve({ data: [] as { id: string; name: string | null; email: string }[] }),
    ])
  if (pErr) throw pErr

  const products = await withSignedUrlsList(
    (productsRaw ?? []) as PublicCatalogProduct[],
    'image_url',
  )
  const productById = new Map(products.map((p) => [p.id, p]))
  const userById = new Map(
    ((usersRaw ?? []) as { id: string; name: string | null; email: string }[]).map(
      (u) => [u.id, u.name ?? u.email],
    ),
  )

  return flags.map((flag) => ({
    flag,
    product_a: productById.get(flag.product_a_id) ?? null,
    product_b: productById.get(flag.product_b_id) ?? null,
    resolved_by_name: flag.resolved_by
      ? (userById.get(flag.resolved_by) ?? null)
      : null,
  }))
}
