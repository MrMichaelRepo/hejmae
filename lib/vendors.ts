// Vendor lookup + auto-populate helpers.
//
// Used at item-create / PO-create time to pre-fill trade pricing,
// vendor email, and lead time from the matching vendors row when one
// exists. The caller decides what to do with the result — they can
// always pass the user-supplied value through unchanged if the user
// provided one (auto-populate is "fill in the blanks", not "override").

import { supabaseAdmin } from '@/lib/supabase/server'
import type { VendorRow } from '@/lib/supabase/types'

// Case-insensitive lookup by exact name. We don't fuzzy-match — a
// designer with vendors "RH" and "RH Modern" expects them to be
// distinct, and silently auto-populating from the wrong one is worse
// than not auto-populating at all.
export async function findVendorByName(
  designerId: string,
  name: string,
): Promise<VendorRow | null> {
  const trimmed = name.trim()
  if (!trimmed) return null
  const sb = supabaseAdmin()
  const { data, error } = await sb
    .from('vendors')
    .select('*')
    .eq('designer_id', designerId)
    .ilike('name', trimmed)
    .maybeSingle()
  if (error) throw error
  return (data as VendorRow | null) ?? null
}

// Compute trade price from retail using the vendor's discount. Returns
// null if either input is missing — the caller falls back to whatever
// the user submitted.
export function tradePriceFromDiscount(
  retailCents: number | null | undefined,
  discountPercent: number | null | undefined,
): number | null {
  if (retailCents == null || discountPercent == null) return null
  if (discountPercent <= 0) return null
  // numeric(5,2) comes back as a string from Supabase; cast defensively.
  const pct = Number(discountPercent)
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return null
  return Math.round(retailCents * (1 - pct / 100))
}

// Whether the caller-supplied trade price should be replaced with one
// derived from the vendor record. We treat "0" as the input default
// (zod's createItem schema defaults trade_price_cents to 0); any other
// value is the user explicitly setting a price.
export function shouldAutoFillTradePrice(
  submittedTradeCents: number | undefined,
): boolean {
  return submittedTradeCents == null || submittedTradeCents === 0
}
