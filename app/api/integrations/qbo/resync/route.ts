// Manually re-push a hejmae entity to QBO. The settings UI calls this from
// per-row "Resync" buttons in the sync log.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireDesigner } from '@/lib/auth/designer'
import { withErrorHandling } from '@/lib/errors'
import { manualResync } from '@/lib/qbo/sync'
import type { QboEntityType } from '@/lib/supabase/types'

const schema = z.object({
  entity_type: z.enum([
    'customer',
    'vendor',
    'invoice',
    'payment',
    'expense',
    'journal_entry',
  ]),
  hejmae_id: z.string().min(1),
})

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const { designerId } = await requireDesigner()
    const body = schema.parse(await req.json())
    const qboId = await manualResync(
      designerId,
      body.entity_type as QboEntityType,
      body.hejmae_id,
    )
    return NextResponse.json({ qbo_id: qboId })
  })
}
