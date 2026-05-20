// Recent QBO sync attempts. Used by the settings UI's error feed.

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { withErrorHandling } from '@/lib/errors'
import { listSyncLog } from '@/lib/qbo/refs'
import type { QboEntityType } from '@/lib/supabase/types'

const ENTITY_TYPES = new Set<QboEntityType>([
  'account',
  'customer',
  'vendor',
  'item',
  'invoice',
  'payment',
  'expense',
  'journal_entry',
])

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const { designerId } = await requireDesigner()
    const sp = req.nextUrl.searchParams
    const rawType = sp.get('entity_type')
    const entityType =
      rawType && ENTITY_TYPES.has(rawType as QboEntityType)
        ? (rawType as QboEntityType)
        : undefined
    const hejmaeId = sp.get('hejmae_id') ?? undefined
    const limitParam = Number(sp.get('limit') ?? '100')
    const limit = Number.isFinite(limitParam)
      ? Math.min(500, Math.max(1, limitParam))
      : 100
    const data = await listSyncLog(designerId, { limit, entityType, hejmaeId })
    return NextResponse.json({ data })
  })
}
