import { z } from 'zod'
import { uuid, moneyCents } from './common'

export const poLine = z.object({
  item_id: uuid.nullish(),
  description: z.string().min(1).max(500),
  quantity: z.number().int().min(1).default(1),
  trade_price_cents: moneyCents,
})

// Date/datetime fields accept ISO strings (or null to clear).
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
const isoDateTime = z.string().datetime({ offset: true })

export const createPurchaseOrder = z.object({
  vendor_name: z.string().min(1).max(200),
  vendor_email: z.string().email().nullish(),
  expected_lead_time_days: z.number().int().min(0).max(3650).nullish(),
  expected_delivery_date: isoDate.nullish(),
  notes: z.string().max(10_000).nullish(),
  lines: z.array(poLine).optional(),
  // Auto-group approved items by vendor and create lines.
  from_approved_items: z.boolean().optional(),
})

export const updatePurchaseOrder = createPurchaseOrder.partial().extend({
  shipped_at: isoDateTime.nullish(),
  delivered_at: isoDateTime.nullish(),
  tracking_number: z.string().max(200).nullish(),
  tracking_url: z.string().url().nullish(),
})
