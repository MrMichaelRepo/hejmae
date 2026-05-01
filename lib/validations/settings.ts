import { z } from 'zod'
import { percent } from './common'

export const pricingMode = z.enum(['retail', 'cost_plus'])

export const updateSettings = z.object({
  name: z.string().max(200).nullish(),
  studio_name: z.string().max(200).nullish(),
  logo_url: z.string().url().nullish(),
  brand_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullish(),
  pricing_mode: pricingMode.optional(),
  default_markup_percent: percent.optional(),
  timezone: z.string().max(100).nullish(),
})
