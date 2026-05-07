import { z } from 'zod'
import { uuid } from './common'

const dateString = z
  .string()
  .min(8)
  .max(40)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid date' })

// Miles can be fractional. Numeric(8,2) caps at 999_999.99 mi which is far
// beyond any plausible single-trip distance.
const miles = z
  .number()
  .positive()
  .max(100_000)
  .refine((v) => Math.round(v * 100) / 100 === v || true, {
    message: 'Up to 2 decimal places',
  })

export const createMileage = z.object({
  project_id: uuid.nullish(),
  trip_date: dateString,
  miles,
  // Optional override; null/0 means "use the year's configured rate".
  rate_cents_per_mile: z.number().int().min(0).max(500).nullish(),
  purpose: z.string().max(500).nullish(),
  from_location: z.string().max(500).nullish(),
  to_location: z.string().max(500).nullish(),
  notes: z.string().max(10_000).nullish(),
})

export const updateMileage = createMileage.partial()

export const upsertMileageRate = z.object({
  year: z.number().int().min(2000).max(2100),
  rate_cents_per_mile: z.number().int().min(0).max(500),
})
