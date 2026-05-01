import { z } from 'zod'
import { uuid, moneyCents, percent } from './common'

export const projectStatus = z.enum(['active', 'completed', 'archived'])
export const pricingMode = z.enum(['retail', 'cost_plus'])

export const createProject = z.object({
  name: z.string().min(1).max(200),
  client_id: uuid.nullish(),
  status: projectStatus.optional(),
  budget_cents: moneyCents.nullish(),
  location: z.string().max(500).nullish(),
  notes: z.string().max(10_000).nullish(),
  floor_plan_url: z.string().url().nullish(),
  pricing_mode: pricingMode.optional(),
  markup_percent: percent.optional(),
})

export const updateProject = createProject.partial()
