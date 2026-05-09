// 1099-NEC vendor totals.
//
// IRS rule of thumb (2026): a 1099-NEC is required for each independent
// contractor / vendor paid $600+ in non-employee compensation during the
// tax year. Payments by credit card or third-party network (Stripe, etc.)
// are reported separately on 1099-K by the processor and are normally
// EXCLUDED from 1099-NEC. We therefore exclude expenses paid from a
// system_key='credit_card' or 'stripe_pending' account.
//
// We sum each vendor's expenses for the calendar year. Free-text vendor
// names without a vendor_id are bucketed under "Unmatched" so the user
// can decide whether to create a vendor record for them.

import { supabaseAdmin } from '@/lib/supabase/server'

export interface Vendor1099Row {
  vendor_id: string
  name: string
  legal_name: string | null
  is_1099_eligible: boolean
  has_tax_id: boolean
  ytd_paid_cents: number
  // True if total >= $600 AND vendor is flagged 1099-eligible.
  needs_1099: boolean
  // True when total >= $600 but vendor isn't flagged eligible — likely
  // user oversight, surfaced as a warning row.
  threshold_unflagged: boolean
}

export interface Form1099Summary {
  tax_year: number
  threshold_cents: number
  rows: Vendor1099Row[]
  unmatched_total_cents: number
  unmatched_count: number
}

const THRESHOLD_CENTS = 600_00

export async function getForm1099Summary(
  designerId: string,
  taxYear: number,
): Promise<Form1099Summary> {
  const sb = supabaseAdmin()
  const yearStart = `${taxYear}-01-01`
  const yearEnd = `${taxYear}-12-31`

  // Pull vendors and expenses for the year.
  const [vRes, eRes, aRes] = await Promise.all([
    sb
      .from('vendors')
      .select('id, name, legal_name, is_1099_eligible, tax_id_last4')
      .eq('designer_id', designerId),
    sb
      .from('expenses')
      .select('vendor_id, vendor_name, amount_cents, payment_account_id')
      .eq('designer_id', designerId)
      .gte('expense_date', yearStart)
      .lte('expense_date', yearEnd),
    sb
      .from('accounts')
      .select('id, system_key')
      .eq('designer_id', designerId),
  ])

  const accountSystemKey = new Map<string, string | null>()
  for (const a of aRes.data ?? []) accountSystemKey.set(a.id, a.system_key)

  const EXCLUDED_SYSTEM_KEYS = new Set(['credit_card', 'stripe_pending'])

  const vendors = vRes.data ?? []
  const ytdByVendor = new Map<string, number>()
  let unmatchedTotal = 0
  let unmatchedCount = 0

  for (const e of eRes.data ?? []) {
    const sk = accountSystemKey.get(e.payment_account_id)
    if (sk && EXCLUDED_SYSTEM_KEYS.has(sk)) continue
    if (e.vendor_id) {
      ytdByVendor.set(e.vendor_id, (ytdByVendor.get(e.vendor_id) ?? 0) + e.amount_cents)
    } else if (e.vendor_name) {
      unmatchedTotal += e.amount_cents
      unmatchedCount += 1
    }
  }

  const rows: Vendor1099Row[] = []
  for (const v of vendors) {
    const ytd = ytdByVendor.get(v.id) ?? 0
    if (ytd === 0 && !v.is_1099_eligible) continue
    const needs = v.is_1099_eligible && ytd >= THRESHOLD_CENTS
    const threshold = !v.is_1099_eligible && ytd >= THRESHOLD_CENTS
    rows.push({
      vendor_id: v.id,
      name: v.name,
      legal_name: v.legal_name,
      is_1099_eligible: v.is_1099_eligible,
      has_tax_id: Boolean(v.tax_id_last4),
      ytd_paid_cents: ytd,
      needs_1099: needs,
      threshold_unflagged: threshold,
    })
  }

  rows.sort((a, b) => b.ytd_paid_cents - a.ytd_paid_cents)

  return {
    tax_year: taxYear,
    threshold_cents: THRESHOLD_CENTS,
    rows,
    unmatched_total_cents: unmatchedTotal,
    unmatched_count: unmatchedCount,
  }
}
