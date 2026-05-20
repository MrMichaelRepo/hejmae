// PATCH /api/finances/bank-transactions/[txnId]
//
// Body discriminator: `action`.
//   'accept'             — confirm the AI proposal; persists matched_entity.
//   'reject'             — drop the proposal; row stays pending for a new pass.
//   'ignore'             — mark as ignored (e.g. internal transfer not in books).
//   'create_expense'     — create a fresh expense from the row.
//                          body: { category_account_id, payment_account_id, vendor_id?, notes? }

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireDesigner } from '@/lib/auth/designer'
import { withErrorHandling, badRequest } from '@/lib/errors'
import {
  acceptProposal,
  createExpenseFromTxn,
  ignoreTxn,
  rejectProposal,
} from '@/lib/banking/actions'

interface Ctx {
  params: Promise<{ txnId: string }>
}

const baseSchema = z.object({
  action: z.enum(['accept', 'reject', 'ignore', 'create_expense']),
})

const createExpenseSchema = z.object({
  action: z.literal('create_expense'),
  category_account_id: z.string().uuid(),
  payment_account_id: z.string().uuid(),
  vendor_id: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export async function PATCH(req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { txnId } = await params
    const { designerId, userId } = await requireDesigner()
    const body = await req.json()
    const parsed = baseSchema.safeParse(body)
    if (!parsed.success) throw badRequest('action required')

    if (parsed.data.action === 'accept') {
      await acceptProposal(designerId, txnId, userId)
    } else if (parsed.data.action === 'reject') {
      await rejectProposal(designerId, txnId, userId)
    } else if (parsed.data.action === 'ignore') {
      await ignoreTxn(designerId, txnId, userId)
    } else if (parsed.data.action === 'create_expense') {
      const full = createExpenseSchema.parse(body)
      await createExpenseFromTxn(designerId, txnId, userId, {
        category_account_id: full.category_account_id,
        payment_account_id: full.payment_account_id,
        vendor_id: full.vendor_id ?? null,
        notes: full.notes ?? null,
      })
    }
    return NextResponse.json({ ok: true })
  })
}
