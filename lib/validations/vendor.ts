import { z } from 'zod'

// Trade discount can go up to ~80% in practice; we cap at 100 to match
// the DB check constraint and reject obvious typos (designers
// occasionally type "150" meaning "1.50%" — better to reject).
const tradeDiscount = z.number().min(0).max(100)

// Numeric string OR number, normalized to number. Supabase returns
// numeric(5,2) as a string by default; we accept either shape so the
// PATCH path can round-trip values it just read.
const tradeDiscountInput = z.preprocess((v) => {
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : v
  }
  return v
}, tradeDiscount.nullish())

// Full TIN: 9 digits with optional dashes, EIN (XX-XXXXXXX) or SSN
// (XXX-XX-XXXX). We strip dashes and normalize to digits at write time.
const taxIdFull = z
  .string()
  .max(20)
  .transform((s) => s.replace(/[\s-]/g, ''))
  .refine((s) => /^\d{9}$/.test(s), {
    message: 'Tax ID must be 9 digits (EIN or SSN)',
  })

export const createVendor = z.object({
  name: z.string().min(1).max(200),
  account_number: z.string().max(200).nullish(),
  account_email: z.string().email().max(200).nullish(),
  contact_name: z.string().max(200).nullish(),
  contact_email: z.string().email().max(200).nullish(),
  contact_phone: z.string().max(50).nullish(),
  website: z.string().url().max(500).nullish(),
  trade_discount_percent: tradeDiscountInput,
  default_lead_time_days: z.number().int().min(0).max(3650).nullish(),
  payment_terms: z.string().max(200).nullish(),
  shipping_notes: z.string().max(2000).nullish(),
  notes: z.string().max(10_000).nullish(),
  // 1099-NEC fields. tax_id_full stays out of API responses unless the
  // caller has finances:view; the route layer handles the redaction.
  is_1099_eligible: z.boolean().optional(),
  legal_name: z.string().max(200).nullish(),
  tax_id_full: taxIdFull.nullish(),
  address_line1: z.string().max(200).nullish(),
  address_line2: z.string().max(200).nullish(),
  address_city: z.string().max(100).nullish(),
  address_state: z.string().max(100).nullish(),
  address_postal_code: z.string().max(20).nullish(),
  address_country: z.string().max(100).nullish(),
})

export const updateVendor = createVendor.partial()
