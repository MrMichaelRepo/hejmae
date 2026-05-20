// Delete a period lock (un-close the period). Owner-only.

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requireRole } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'

interface Ctx {
  params: Promise<{ lockId: string }>
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { lockId } = await params
    const ctx = await requireDesigner()
    requireRole(ctx, 'owner')
    const { error } = await supabaseAdmin()
      .from('period_locks')
      .delete()
      .eq('id', lockId)
      .eq('designer_id', ctx.designerId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  })
}
