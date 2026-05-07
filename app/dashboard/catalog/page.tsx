import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import CatalogClient from './CatalogClient'
import type { CatalogProduct } from '@/lib/types-ui'

async function loadInitialLibrary(designerId: string): Promise<CatalogProduct[]> {
  const sb = supabaseAdmin()
  const { data: itemIds } = await sb
    .from('items')
    .select('catalog_product_id')
    .eq('designer_id', designerId)
    .not('catalog_product_id', 'is', null)

  const ids = Array.from(
    new Set((itemIds ?? []).map((r) => r.catalog_product_id).filter(Boolean)),
  ) as string[]
  if (!ids.length) return []

  const { data } = await sb
    .from('catalog_products')
    .select('*')
    .in('id', ids)
    .order('updated_at', { ascending: false })

  return (data ?? []) as CatalogProduct[]
}

export default async function CatalogPage() {
  const { designerId } = await requireDesigner()
  const initialLibrary = await loadInitialLibrary(designerId)
  return <CatalogClient initialLibrary={initialLibrary} />
}
