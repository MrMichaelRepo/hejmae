import { z } from 'zod'
import { uuid, moneyCents } from './common'

// Date string in YYYY-MM-DD form. We accept both that and full ISO; the DB
// column is `date` and Postgres will narrow either to a calendar day.
const dateString = z
  .string()
  .min(8)
  .max(40)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid date' })

export const createExpense = z.object({
  project_id: uuid.nullish(),
  category_account_id: uuid,
  payment_account_id: uuid,
  expense_date: dateString,
  // Strictly > 0 — a zero-dollar expense is just noise.
  amount_cents: moneyCents.refine((v) => v > 0, {
    message: 'amount_cents must be > 0',
  }),
  vendor_name: z.string().max(200).nullish(),
  description: z.string().max(500).nullish(),
  receipt_path: z.string().max(1000).nullish(),
  receipt_url: z.string().url().max(2000).nullish(),
  receipt_content_type: z.string().max(200).nullish(),
  billable_to_client: z.boolean().default(false),
  notes: z.string().max(10_000).nullish(),
})

export const updateExpense = createExpense.partial()
