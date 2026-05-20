import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { withErrorHandling } from '@/lib/errors'
import { buildBalanceSheet } from '@/lib/finances/balance_sheet'

const dateRe = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const { designerId } = await requireDesigner()
    const param = req.nextUrl.searchParams.get('as_of')
    const asOf = param && dateRe.test(param) ? param : new Date().toISOString().slice(0, 10)
    const data = await buildBalanceSheet(designerId, asOf)
    return NextResponse.json({ data })
  })
}
