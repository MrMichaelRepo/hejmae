// Re-run the AI matching pass on demand (e.g. after the user added new
// expenses and wants the model to take another look). Shares the same
// rate-limit bucket as the upload route since both spend AI tokens.

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { withErrorHandling, tooManyRequests } from '@/lib/errors'
import { checkRateLimit } from '@/lib/ratelimit'
import { runMatchingPass } from '@/lib/banking/ai-match'

interface Ctx {
  params: Promise<{ importId: string }>
}

export async function POST(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { importId } = await params
    const { designerId } = await requireDesigner()
    const rl = await checkRateLimit('bankImport', designerId)
    if (!rl.ok) {
      throw tooManyRequests('Too many match runs. Try again in a few minutes.')
    }
    const result = await runMatchingPass(designerId, importId)
    return NextResponse.json({ data: result })
  })
}
