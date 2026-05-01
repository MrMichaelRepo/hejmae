import { z } from 'zod'
import { uuid, moneyCents } from './common'

export const poLine = z.object({
  item_id: uuid.nullish(),
  description: z.string().min(1).max(500),
  quantity: z.number().int().min(1).default(1),
  trade_price_cents: moneyCents,
})

export const createPurchaseOrder = z.object({
  vendor_name: z.string().min(1).max(200),
  vendor_email: z.string().email().nullish(),
  expected_lead_time_days: z.number().int().min(0).max(3650).nullish(),
  notes: z.string().max(10_000).nullish(),
  lines: z.array(poLine).optional(),
  // Auto-group approved items by vendor and create lines.
  from_approved_items: z.boolean().optional(),
})

export const updatePurchaseOrder = createPurchaseOrder.partial()
