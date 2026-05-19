// One-shot backfill: generates an embedding for every catalog_products
// row that doesn't already have one. Idempotent — re-runnable.
//
// Usage:
//   npm run backfill:embeddings
//   # or
//   npx tsx scripts/backfill-catalog-embeddings.ts
//
// Reads OPENAI_API_KEY + SUPABASE_* from .env.local (via @next/env, the
// same loader Next uses), so you don't need a separate dotenv config.

import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())

// Imports below depend on env being loaded first.
import { supabaseAdmin } from '@/lib/supabase/server'
import { embedText, isOpenAIConfigured } from '@/lib/ai/openai'
import { buildEmbeddingText } from '@/lib/catalog/embed'

const BATCH_SIZE = 100
const CONCURRENCY = 5

async function main() {
  if (!isOpenAIConfigured()) {
    console.error('OPENAI_API_KEY is not set — aborting.')
    process.exit(1)
  }

  const sb = supabaseAdmin()
  let totalDone = 0
  let totalFailed = 0

  while (true) {
    const { data: rows, error } = await sb
      .from('catalog_products')
      .select('id, name, vendor, brand, item_type, style_tag, description')
      .is('embedding', null)
      .is('merged_into_id', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE)
    if (error) throw error
    if (!rows || rows.length === 0) break

    console.log(`Batch of ${rows.length}…`)
    const results = await runWithConcurrency(rows, CONCURRENCY, async (row) => {
      const text = buildEmbeddingText(row)
      if (!text) return { id: row.id, skipped: true as const }
      try {
        const vec = await embedText(text)
        const { error: upErr } = await sb
          .from('catalog_products')
          .update({
            embedding: JSON.stringify(vec) as unknown as string,
            embedding_updated_at: new Date().toISOString(),
          })
          .eq('id', row.id)
        if (upErr) throw upErr
        return { id: row.id, ok: true as const }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(`  ${row.id}: ${msg}`)
        return { id: row.id, ok: false as const }
      }
    })

    for (const r of results) {
      if ('skipped' in r) continue
      if (r.ok) totalDone++
      else totalFailed++
    }
    console.log(`  done: ${totalDone}, failed: ${totalFailed}`)
  }

  console.log(`Backfill complete. ${totalDone} embedded, ${totalFailed} failed.`)
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workers: Promise<void>[] = []
  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    workers.push(
      (async () => {
        while (true) {
          const idx = cursor++
          if (idx >= items.length) return
          results[idx] = await worker(items[idx]!)
        }
      })(),
    )
  }
  await Promise.all(workers)
  return results
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
