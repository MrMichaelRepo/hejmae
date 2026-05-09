// Update account name / Schedule C mapping / description / active flag.
// Code, type, and system_key are immutable for system accounts.

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, notFound } from '@/lib/errors'
import { updateAccount } from '@/lib/validations/account'

interface Ctx {
  params: Promise<{ accountId: string }>
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { accountId } = await params
    const ctx = await requireDesigner()
    requirePermission(ctx, 'finances:manage_settings')
    const body = updateAccount.parse(await req.json())

    const sb = supabaseAdmin()
    const { data: existing, error: loadErr } = await sb
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .eq('designer_id', ctx.designerId)
      .maybeSingle()
    if (loadErr) throw loadErr
    if (!existing) throw notFound('Account not found')

    const { data, error } = await sb
      .from('accounts')
      .update(body)
      .eq('id', accountId)
      .eq('designer_id', ctx.designerId)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ data })
  })
}
