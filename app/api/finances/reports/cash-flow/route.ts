import { NextResponse } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { withErrorHandling } from '@/lib/errors'
import { buildCashFlowForecast } from '@/lib/finances/cash_flow'

export async function GET() {
  return withErrorHandling(async () => {
    const { designerId } = await requireDesigner()
    const data = await buildCashFlowForecast(designerId)
    return NextResponse.json({ data })
  })
}
