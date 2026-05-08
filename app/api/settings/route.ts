import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'
import { updateSettings } from '@/lib/validations/settings'
import { withSignedUrls } from '@/lib/storage'

const USER_URL_FIELDS = ['logo_url'] as const

export async function GET() {
  return withErrorHandling(async () => {
    const { user } = await requireDesigner()
    return NextResponse.json({ data: await withSignedUrls(user, USER_URL_FIELDS) })
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
    return NextResponse.json({ data: await withSignedUrls(data, USER_URL_FIELDS) })
  })
}
