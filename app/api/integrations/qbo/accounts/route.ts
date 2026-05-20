// List QBO accounts (the connected studio's QB chart of accounts), used by
// the account-mapping UI to populate per-row pickers.

import { NextResponse } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { withErrorHandling, serverError } from '@/lib/errors'
import { listQboAccounts, type QboAccount } from '@/lib/qbo/accounts'
import { QboNotConnectedError } from '@/lib/qbo/client'

interface AccountsResponse {
  data: QboAccount[]
}

export async function GET() {
  return withErrorHandling<AccountsResponse>(async () => {
    const ctx = await requireDesigner()
    try {
      const data = await listQboAccounts(ctx.designerId)
      return NextResponse.json({ data })
    } catch (e) {
      if (e instanceof QboNotConnectedError) {
        throw serverError('QuickBooks is not connected for this studio.')
      }
      throw e
    }
  })
}
