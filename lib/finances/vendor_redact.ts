// Vendor 1099 fields handling. tax_id_full is sensitive — never leave the
// server. We expose only tax_id_last4 (set automatically on write).

import type { VendorRow } from '@/lib/supabase/types'

export function redactVendor<T extends Partial<VendorRow>>(v: T): T {
  // Strip tax_id_full from any API response by stamping it to null.
  return { ...v, tax_id_full: null } as T
}

// Given a write body that may include tax_id_full, derive tax_id_last4
// and ensure both fields are kept in sync.
export function withDerivedTaxIdLast4<
  T extends { tax_id_full?: string | null | undefined },
>(body: T): T & { tax_id_last4?: string | null } {
  if (body.tax_id_full == null) return body as T & { tax_id_last4?: string | null }
  const digits = body.tax_id_full.replace(/\D/g, '')
  if (digits.length === 0) {
    return { ...body, tax_id_full: null, tax_id_last4: null }
  }
  return { ...body, tax_id_last4: digits.slice(-4) }
}
