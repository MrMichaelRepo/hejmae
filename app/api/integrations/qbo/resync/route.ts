// Manually re-push a hejmae entity to QBO. The settings UI calls this from
// per-row "Resync" buttons in the sync log.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
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
    const ctx = await requireDesigner()
    // Resync makes outbound API calls under the studio's QBO tokens.
    // Gate on finances:manage_invoices — same surface that lets a user
    // create the source invoice/expense in the first place.
    requirePermission(ctx, 'finances:manage_invoices')
    const { designerId } = ctx
    const body = schema.parse(await req.json())
    const qboId = await manualResync(
      designerId,
      body.entity_type as QboEntityType,
      body.hejmae_id,
    )
    return NextResponse.json({ qbo_id: qboId })
  })
}
