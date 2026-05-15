// Weekly catalog duplicate scan.
//
// Triggered by /api/cron/catalog-duplicate-scan (Mondays 06:00 UTC) and
// also runnable manually via npm script for backfills. The job is
// idempotent and safe to re-run mid-week: existing unresolved flags get
// last_seen_at refreshed; previously-resolved flags are never re-opened.
//
// Scope: only products created in the last 7 days are compared against
// the full live catalog. The full catalog is *not* compared against
// itself every week — that would scale badly and re-surface the same
// pairs forever. New arrivals catch the bulk of dedup work.

import { supabaseAdmin } from '@/lib/supabase/server'

const SIMILARITY_THRESHOLD = 0.8
const PRICE_TOLERANCE = 0.1 // ±10 %

export interface ScanResult {
  scanned_at: string
  new_products_scanned: number
  new_flags_created: number
  flags_refreshed: number
  resolved_flags_skipped: number
}

interface Candidate {
  source_id: string
  candidate_id: string
  similarity: number
  source_vendor: string | null
  candidate_vendor: string | null
  source_price: number | null
  candidate_price: number | null
  source_url: string | null
  candidate_url: string | null
}

export async function runDuplicateScan(): Promise<ScanResult> {
  const sb = supabaseAdmin()
  const scannedAt = new Date()
  const since = new Date(scannedAt.getTime() - 7 * 24 * 60 * 60 * 1000)

  // Step 1 — find candidate "new" products. We use created_at as the
  // signal per spec. Embedding must be present so we can compare.
  const { data: newProducts, error: newErr } = await sb
    .from('catalog_products')
    .select('id')
    .gte('created_at', since.toISOString())
    .is('deleted_at', null)
    .is('merged_into_id', null)
    .not('embedding', 'is', null)
  if (newErr) throw newErr

  const newIds = (newProducts ?? []).map((r) => r.id as string)

  let newFlags = 0
  let refreshed = 0
  let skippedResolved = 0
  const handledPairs = new Set<string>()

  for (const sourceId of newIds) {
    const { data: candidates, error: rpcErr } = await sb.rpc(
      'find_catalog_duplicate_candidates',
      {
        p_source_id: sourceId,
        p_threshold: SIMILARITY_THRESHOLD,
      },
    )
    if (rpcErr) {
      console.error('[duplicate-scan] rpc failed for', sourceId, rpcErr)
      continue
    }

    for (const c of (candidates ?? []) as Candidate[]) {
      const pair = orderPair(c.source_id, c.candidate_id)
      const key = `${pair.a}|${pair.b}`
      if (handledPairs.has(key)) continue
      handledPairs.add(key)

      const reasons = computeMatchReasons(c)

      // Look up any existing flag for this pair.
      const { data: existing, error: lookupErr } = await sb
        .from('catalog_duplicate_flags')
        .select('id, resolved, status')
        .eq('product_a_id', pair.a)
        .eq('product_b_id', pair.b)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (lookupErr) {
        console.error('[duplicate-scan] lookup failed', lookupErr)
        continue
      }

      if (existing?.resolved) {
        // Already merged or dismissed — never re-open.
        skippedResolved += 1
        continue
      }

      if (existing && !existing.resolved) {
        const { error: updErr } = await sb
          .from('catalog_duplicate_flags')
          .update({
            similarity_score: c.similarity,
            match_reasons: reasons,
            last_seen_at: scannedAt.toISOString(),
          })
          .eq('id', existing.id)
        if (updErr) {
          console.error('[duplicate-scan] refresh failed', updErr)
          continue
        }
        refreshed += 1
        continue
      }

      const { error: insErr } = await sb
        .from('catalog_duplicate_flags')
        .insert({
          product_a_id: pair.a,
          product_b_id: pair.b,
          similarity_score: c.similarity,
          match_reasons: reasons,
          status: 'pending',
          resolved: false,
          flagged_at: scannedAt.toISOString(),
          last_seen_at: scannedAt.toISOString(),
        })
      if (insErr) {
        // Likely a concurrent insert hit the partial unique index. Treat
        // as refresh-equivalent rather than failing the whole scan.
        console.warn('[duplicate-scan] insert collision', insErr.message)
        continue
      }
      newFlags += 1
    }
  }

  return {
    scanned_at: scannedAt.toISOString(),
    new_products_scanned: newIds.length,
    new_flags_created: newFlags,
    flags_refreshed: refreshed,
    resolved_flags_skipped: skippedResolved,
  }
}

function computeMatchReasons(c: Candidate): string[] {
  const reasons: string[] = ['high_vector_similarity']

  if (
    c.source_vendor &&
    c.candidate_vendor &&
    c.source_vendor.trim().toLowerCase() ===
      c.candidate_vendor.trim().toLowerCase()
  ) {
    reasons.push('same_vendor')
  }

  if (c.source_price != null && c.candidate_price != null) {
    const max = Math.max(c.source_price, c.candidate_price)
    if (max > 0) {
      const delta = Math.abs(c.source_price - c.candidate_price) / max
      if (delta < PRICE_TOLERANCE) reasons.push('similar_price')
    }
  }

  if (c.source_url && c.candidate_url) {
    const sd = safeDomain(c.source_url)
    const cd = safeDomain(c.candidate_url)
    if (sd && cd && sd === cd && c.source_url !== c.candidate_url) {
      reasons.push('same_source_domain')
    }
  }

  return reasons
}

function safeDomain(raw: string): string | null {
  try {
    const u = new URL(raw)
    return u.hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

function orderPair(x: string, y: string): { a: string; b: string } {
  return x < y ? { a: x, b: y } : { a: y, b: x }
}
