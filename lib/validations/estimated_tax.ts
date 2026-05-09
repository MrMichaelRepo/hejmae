import { z } from 'zod'
import { moneyCents } from './common'

const dateString = z
  .string()
  .min(8)
  .max(40)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid date' })

export const upsertEstimatedTaxPayment = z.object({
  jurisdiction: z.enum(['federal', 'state']),
  tax_year: z.number().int().min(2000).max(2100),
  quarter: z.number().int().min(1).max(4),
  amount_cents: moneyCents,
  paid_at: dateString.nullish(),
  reference: z.string().max(200).nullish(),
  notes: z.string().max(2000).nullish(),
})
