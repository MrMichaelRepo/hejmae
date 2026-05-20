// Re-run the AI matching pass on demand (e.g. after the user added new
// expenses and wants the model to take another look).

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { withErrorHandling } from '@/lib/errors'
import { runMatchingPass } from '@/lib/banking/ai-match'

interface Ctx {
  params: Promise<{ importId: string }>
}

export async function POST(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { importId } = await params
    const { designerId } = await requireDesigner()
    const result = await runMatchingPass(designerId, importId)
    return NextResponse.json({ data: result })
  })
}
