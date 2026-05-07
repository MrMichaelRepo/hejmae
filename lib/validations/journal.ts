import { z } from 'zod'
import { uuid } from './common'

const dateString = z
  .string()
  .min(8)
  .max(40)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid date' })

// Signed: positive = debit, negative = credit. The DB rejects 0.
const signedAmountCents = z
  .number()
  .int()
  .refine((n) => n !== 0, { message: 'amount_cents cannot be 0' })
  .refine((n) => Math.abs(n) <= 1_000_000_000_00, {
    message: 'Out of range',
  })

export const createManualJournalEntry = z.object({
  entry_date: dateString,
  memo: z.string().max(500).nullish(),
  lines: z
    .array(
      z.object({
        account_id: uuid,
        amount_cents: signedAmountCents,
        project_id: uuid.nullish(),
        memo: z.string().max(500).nullish(),
      }),
    )
    .min(2, 'A journal entry needs at least 2 lines')
    .refine(
      (lines) => lines.reduce((a, l) => a + l.amount_cents, 0) === 0,
      { message: 'Debits must equal credits' },
    ),
})
