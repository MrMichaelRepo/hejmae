import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'
import { updateSettings } from '@/lib/validations/settings'

export async function GET() {
  return withErrorHandling(async () => {
    const { user } = await requireDesigner()
    return NextResponse.json({ data: user })
  })
}

export async function PATCH(req: NextRequest) {
  return withErrorHandling(async () => {
    const { user } = await requireDesigner()
    const body = updateSettings.parse(await req.json())
    const { data, error } = await supabaseAdmin()
      .from('users')
      .update(body)
      .eq('id', user.id)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ data })
  })
}
