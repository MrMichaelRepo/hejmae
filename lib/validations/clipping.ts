import { z } from 'zod'
import { uuid, moneyCents } from './common'

export const clipUrlInput = z.object({
  url: z.string().url().max(2048),
  project_id: uuid.nullish(),
  page_title: z.string().max(500).nullish(),
  // Pre-rendered DOM from the extension's content-script capture.
  // Lets us validate + scrape against the actual rendered page instead
  // of re-fetching server-side (which fails for JS-rendered SPAs and
  // for sites with bot protection). Capped at ~2 MB; the extension
  // truncates before sending.
  html: z.string().max(2_000_000).nullish(),
})

export const internalScrapeInput = z.object({
  clipping_item_id: uuid,
  url: z.string().url().max(2048),
  designer_id: uuid,
})

export const clippingAddToProjectInput = z.object({
  project_id: uuid,
  room_id: uuid.nullish(),
  trade_price_cents: moneyCents.nullish(),
})

export const clippingListQuery = z.object({
  designer_id: uuid.nullish(),
  project_id: uuid.nullish(),
  vendor: z.string().max(200).nullish(),
  item_type: z.string().max(100).nullish(),
  week_added: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'week_added must be an ISO date (YYYY-MM-DD)')
    .nullish(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
})
