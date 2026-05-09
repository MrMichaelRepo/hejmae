import { z } from 'zod'
import { uuid } from './common'

const isoDateTime = z
  .string()
  .min(8)
  .max(40)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid date' })

export const createTimeEntry = z.object({
  project_id: uuid,
  description: z.string().min(1).max(500),
  started_at: isoDateTime,
  ended_at: isoDateTime.nullish(),
  // Caller can supply a snapshot rate, otherwise the API fills it from
  // the user's `default_hourly_rate_cents`. Stored at log time so changing
  // the user's default later doesn't retroactively rebill.
  hourly_rate_cents: z.number().int().min(0).max(1_000_000_00).optional(),
  billable: z.boolean().default(true),
  notes: z.string().max(10_000).nullish(),
  // For backdated manual entries — the route validates duration_minutes
  // matches ended_at - started_at if both are present.
  duration_minutes: z.number().int().min(0).max(60 * 24 * 30).optional(),
})

export const updateTimeEntry = createTimeEntry.partial().extend({
  // Stop a running timer.
  stop: z.boolean().optional(),
})

// Start a new timer. If a running timer already exists for this user, the
// route stops it before starting the new one.
export const startTimer = z.object({
  project_id: uuid,
  description: z.string().min(1).max(500),
  billable: z.boolean().default(true),
})
