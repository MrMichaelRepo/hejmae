// GET  ?cutover_date=YYYY-MM-DD → preview the opening JE that would post.
// POST { cutover_date }         → actually post the JE.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireDesigner } from '@/lib/auth/designer'
import { requireRole } from '@/lib/auth/permissions'
import { withErrorHandling, badRequest } from '@/lib/errors'
import {
  applyTrialBalance,
  previewTrialBalance,
} from '@/lib/qbo/import-trial-balance'

const dateRegex = /^\d{4}-\d{2}-\d{2}$/
const bodySchema = z.object({
  cutover_date: z.string().regex(dateRegex),
})

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const { designerId } = await requireDesigner()
    const cutover = req.nextUrl.searchParams.get('cutover_date')
    if (!cutover || !dateRegex.test(cutover)) {
      throw badRequest('cutover_date (YYYY-MM-DD) is required')
    }
    const data = await previewTrialBalance(designerId, cutover)
    return NextResponse.json({ data })
  })
}

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requireRole(ctx, 'owner')
    const body = bodySchema.parse(await req.json())
    const result = await applyTrialBalance(ctx.designerId, body.cutover_date, ctx.userId)
    return NextResponse.json({ data: result })
  })
}
