import { z } from 'zod'
import { uuid, moneyCents } from './common'

export const invoiceType = z.enum(['deposit', 'progress', 'final'])

export const createInvoiceLine = z.object({
  item_id: uuid.nullish(),
  description: z.string().min(1).max(500),
  quantity: z.number().int().min(1).default(1),
  unit_price_cents: moneyCents,
})

export const createInvoice = z.object({
  type: invoiceType.default('progress'),
  notes: z.string().max(10_000).nullish(),
  // Either provide explicit line items, or `from_approved_items` to auto-fill
  // from items currently approved on the project.
  lines: z.array(createInvoiceLine).optional(),
  from_approved_items: z.boolean().optional(),
}).refine(
  (v) => Boolean(v.lines?.length) || v.from_approved_items === true,
  { message: 'Provide lines[] or set from_approved_items=true' },
)

export const updateInvoice = z.object({
  type: invoiceType.optional(),
  notes: z.string().max(10_000).nullish(),
  lines: z.array(createInvoiceLine).optional(),
})
