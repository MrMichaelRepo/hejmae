// Chart-of-accounts mappings between hejmae accounts and QBO accounts.
//
// GET  → { accounts: AccountRow[], mappings: { [hejmae_account_id]: qbo_account_id } }
// PUT  → { account_id, qbo_account_id | null } — set or clear a single mapping.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireDesigner } from '@/lib/auth/designer'
import { requireRole } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'
import {
  clearAccountMapping,
  setAccountMapping,
} from '@/lib/qbo/accounts'
import type { AccountRow } from '@/lib/supabase/types'

interface MappingsResponse {
  accounts: AccountRow[]
  mappings: Record<string, string>
}

export async function GET() {
  return withErrorHandling<MappingsResponse>(async () => {
    const { designerId } = await requireDesigner()
    const sb = supabaseAdmin()
    const [accountsRes, refsRes] = await Promise.all([
      sb
        .from('accounts')
        .select('*')
        .eq('designer_id', designerId)
        .eq('is_active', true)
        .order('code', { ascending: true }),
      sb
        .from('qbo_external_refs')
        .select('hejmae_id, qbo_id')
        .eq('designer_id', designerId)
        .eq('entity_type', 'account'),
    ])
    if (accountsRes.error) throw accountsRes.error
    if (refsRes.error) throw refsRes.error
    const mappings: Record<string, string> = {}
    for (const r of refsRes.data ?? []) {
      mappings[(r as { hejmae_id: string }).hejmae_id] = (r as { qbo_id: string }).qbo_id
    }
    return NextResponse.json({
      accounts: (accountsRes.data ?? []) as AccountRow[],
      mappings,
    })
  })
}

const updateSchema = z.object({
  account_id: z.string().uuid(),
  qbo_account_id: z.string().nullable(),
})

export async function PUT(req: NextRequest) {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requireRole(ctx, 'owner')
    const body = updateSchema.parse(await req.json())
    if (body.qbo_account_id) {
      await setAccountMapping(ctx.designerId, body.account_id, body.qbo_account_id)
    } else {
      await clearAccountMapping(ctx.designerId, body.account_id)
    }
    return NextResponse.json({ ok: true })
  })
}
