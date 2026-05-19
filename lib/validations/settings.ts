import { z } from 'zod'
import { moneyCents, percent, storedAsset } from './common'

export const pricingMode = z.enum(['retail', 'cost_plus'])

export const updateSettings = z.object({
  name: z.string().max(200).nullish(),
  studio_name: z.string().max(200).nullish(),
  logo_url: storedAsset.nullish(),
  brand_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullish(),
  pricing_mode: pricingMode.optional(),
  default_markup_percent: percent.optional(),
  timezone: z.string().max(100).nullish(),
  default_hourly_rate_cents: moneyCents.optional(),
  // 0 to 168h, stored as minutes. Check matches the SQL CHECK constraint.
  weekly_capacity_minutes: z.number().int().min(0).max(10_080).optional(),
  auto_straighten_floor_plans: z.boolean().optional(),
})
