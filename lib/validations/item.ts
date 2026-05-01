import { z } from 'zod'
import { uuid, moneyCents } from './common'

export const itemStatus = z.enum([
  'sourcing',
  'approved',
  'ordered',
  'received',
  'installed',
])

export const createItem = z.object({
  room_id: uuid.nullish(),
  catalog_product_id: uuid.nullish(),
  name: z.string().min(1).max(300),
  vendor: z.string().max(200).nullish(),
  image_url: z.string().url().nullish(),
  source_url: z.string().url().nullish(),
  trade_price_cents: moneyCents.default(0),
  retail_price_cents: moneyCents.nullish(),
  // client_price_cents is computed server-side — never accepted from input.
  quantity: z.number().int().min(1).default(1),
  status: itemStatus.optional(),
  floor_plan_pin_x: z.number().nullish(),
  floor_plan_pin_y: z.number().nullish(),
  notes: z.string().max(10_000).nullish(),
})

export const updateItem = createItem.partial()

export const itemFromCatalog = z.object({
  catalog_product_id: uuid,
  room_id: uuid.nullish(),
  trade_price_cents: moneyCents,
  quantity: z.number().int().min(1).default(1),
  notes: z.string().max(10_000).nullish(),
})
