import { z } from 'zod'
import { uuid, moneyCents } from './common'

export const invoiceType = z.enum(['deposit', 'progress', 'final'])

export const createInvoiceLine = z.object({
  item_id: uuid.nullish(),
  description: z.string().min(1).max(500),
  quantity: z.number().int().min(1).default(1),
  unit_price_cents: moneyCents,
  // Whether this line is subject to the invoice's tax rate. Default off so
  // services-only invoices don't accidentally pick up tax when the studio
  // has set a non-zero default rate.
  taxable: z.boolean().optional().default(false),
})

// Tax rate in basis points (825 = 8.25%). Cap mirrors DB check constraint.
const taxRateBps = z.number().int().min(0).max(10_000)
const stateCode = z
  .string()
  .length(2)
  .regex(/^[A-Z]{2}$/)
  .nullish()

export const createInvoice = z
  .object({
    type: invoiceType.default('progress'),
    notes: z.string().max(10_000).nullish(),
    // Either provide explicit line items, or `from_approved_items` to auto-fill
    // from items currently approved on the project.
    lines: z.array(createInvoiceLine).optional(),
    from_approved_items: z.boolean().optional(),
    // Tax. If omitted, the studio's default rate + state are applied.
    tax_rate_bps: taxRateBps.optional(),
    tax_state_code: stateCode,
  })
  .refine(
    (v) => Boolean(v.lines?.length) || v.from_approved_items === true,
    { message: 'Provide lines[] or set from_approved_items=true' },
  )

export const updateInvoice = z.object({
  type: invoiceType.optional(),
  notes: z.string().max(10_000).nullish(),
  lines: z.array(createInvoiceLine).optional(),
  tax_rate_bps: taxRateBps.optional(),
  tax_state_code: stateCode,
})
