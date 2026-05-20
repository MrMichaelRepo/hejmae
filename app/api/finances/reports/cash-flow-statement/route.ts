// GET /api/finances/reports/cash-flow-statement?from=YYYY-MM-DD&to=YYYY-MM-DD

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { withErrorHandling } from '@/lib/errors'
import { buildCashFlowStatement } from '@/lib/finances/cash_flow_statement'

const dateRe = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requirePermission(ctx, 'finances:view')
    const sp = req.nextUrl.searchParams
    const today = new Date().toISOString().slice(0, 10)
    const ytdStart = today.slice(0, 4) + '-01-01'
    const from = sp.get('from') && dateRe.test(sp.get('from')!) ? sp.get('from')! : ytdStart
    const to = sp.get('to') && dateRe.test(sp.get('to')!) ? sp.get('to')! : today
    const data = await buildCashFlowStatement(ctx.designerId, from, to)
    return NextResponse.json({ data })
  })
}
