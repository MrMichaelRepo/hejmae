// /api/finances/receipts — upload a receipt file and return its public URL.
//
// Receipts aren't tied to a project (an expense may not have one), so we
// scope the storage path by expense_id when supplied; otherwise we route
// to a "_unattached" bucket that the client can later attach. The caller
// is responsible for writing the returned receipt_url / receipt_path back
// onto the expense via PATCH.

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { withErrorHandling, badRequest } from '@/lib/errors'
import { uploadAsset } from '@/lib/storage'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const { designerId } = await requireDesigner()
    const form = await req.formData()
    const file = form.get('file')
    const expenseId = form.get('expense_id')

    if (!(file instanceof File)) throw badRequest('file is required')

    const result = await uploadAsset({
      kind: 'receipt',
      designerId,
      ownerId: typeof expenseId === 'string' && expenseId ? expenseId : 'unattached',
      file,
    })

    return NextResponse.json({ data: result }, { status: 201 })
  })
}
