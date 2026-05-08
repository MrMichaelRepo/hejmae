import { z } from 'zod'
import { normalizeStoredAsset } from '@/lib/storage'

export const uuid = z.string().uuid()
export const moneyCents = z
  .number()
  .int()
  .nonnegative()
  .max(1_000_000_000_00) // $1B sanity cap
export const percent = z.number().min(0).max(1000)

// Schema for a column that holds either a hejmae-bucket storage path or
// an external https URL. Accepts both shapes from the client (since GET
// responses ship signed URLs, the client may round-trip those on a
// subsequent PATCH) and normalizes any inbound signed/public Supabase URL
// back to a bare path before it hits the DB.
export const storedAsset = z
  .string()
  .max(2048)
  .transform((v) => normalizeStoredAsset(v))
