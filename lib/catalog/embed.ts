// Background embedding generation for catalog_products.
//
// Two entry points:
//   * generateCatalogEmbedding(id) — fire-and-forget runner. Loads the
//     row, builds the embedding string, calls OpenAI, writes the result
//     back. Mirrors lib/clippings/run-scrape.ts: never throws; logs and
//     moves on if anything fails.
//   * buildEmbeddingText(row) — exported for the backfill script so it
//     can reuse the same concatenation logic.
//
// Soft-fails when OPENAI_API_KEY is missing so local dev without an
// OpenAI key still works (rows just keep embedding = null and won't show
// up in image-search results).

import { supabaseAdmin } from '@/lib/supabase/server'
import { embedText, isOpenAIConfigured } from '@/lib/ai/openai'
import type { CatalogProductRow } from '@/lib/supabase/types'

type EmbedInput = Pick<
  CatalogProductRow,
  'name' | 'vendor' | 'brand' | 'item_type' | 'style_tag' | 'description'
>

export function buildEmbeddingText(row: EmbedInput): string {
  const parts: string[] = []
  const name = row.name?.trim()
  const vendor = row.vendor?.trim()
  if (name && vendor) parts.push(`${name} by ${vendor}.`)
  else if (name) parts.push(`${name}.`)
  else if (vendor) parts.push(`Product from ${vendor}.`)

  const brand = row.brand?.trim()
  if (brand && brand !== vendor) parts.push(`Brand: ${brand}.`)

  const itemType = row.item_type?.trim()
  if (itemType) parts.push(`Type: ${itemType}.`)

  const style = row.style_tag?.trim()
  if (style) parts.push(`Style: ${style}.`)

  const description = row.description?.trim()
  if (description) parts.push(description.slice(0, 800))

  return parts.join(' ')
}

export async function generateCatalogEmbedding(
  catalogProductId: string,
): Promise<void> {
  try {
    if (!isOpenAIConfigured()) return
    await runInner(catalogProductId)
  } catch (err) {
    console.error(
      '[catalog.embed] failed for',
      catalogProductId,
      err instanceof Error ? err.message : err,
    )
  }
}

async function runInner(catalogProductId: string): Promise<void> {
  const sb = supabaseAdmin()
  const { data: row, error } = await sb
    .from('catalog_products')
    .select('id, name, vendor, brand, item_type, style_tag, description')
    .eq('id', catalogProductId)
    .maybeSingle()
  if (error) throw error
  if (!row) return

  const text = buildEmbeddingText(row as EmbedInput)
  if (!text) return

  const vector = await embedText(text)
  // pgvector's text input format is `[v1,v2,...]`. JSON.stringify of a
  // number[] produces exactly that, and PostgREST hands the string
  // through to the column's input function. Passing the raw array also
  // works in most cases but stringifying is the documented-stable form.
  const { error: updateErr } = await sb
    .from('catalog_products')
    .update({
      embedding: JSON.stringify(vector) as unknown as string,
      embedding_updated_at: new Date().toISOString(),
    })
    .eq('id', catalogProductId)
  if (updateErr) throw updateErr
}
