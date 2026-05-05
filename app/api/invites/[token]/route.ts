// Public preview of an invite by token. Returns enough for the landing page
// to render before sign-in. Does NOT require auth — knowing the token is the
// authorization.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, notFound } from '@/lib/errors'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  return withErrorHandling(async () => {
    const { token } = await params
    const sb = supabaseAdmin()

    const { data, error } = await sb
      .from('studio_invites')
      .select(
        'id, email, role, accepted_at, revoked_at, studio:studios!inner(id, name, owner:users!studios_owner_user_id_fkey(name, studio_name, logo_url, brand_color))',
      )
      .eq('token', token)
      .maybeSingle()
    if (error) throw error
    if (!data) throw notFound('Invite not found')

    type Row = {
      id: string
      email: string
      role: string
      accepted_at: string | null
      revoked_at: string | null
      studio: {
        id: string
        name: string
        owner: {
          name: string | null
          studio_name: string | null
          logo_url: string | null
          brand_color: string | null
        } | null
      }
    }
    const row = data as unknown as Row

    return NextResponse.json({
      data: {
        id: row.id,
        email: row.email,
        role: row.role,
        status: row.revoked_at
          ? 'revoked'
          : row.accepted_at
            ? 'accepted'
            : 'pending',
        studio: {
          id: row.studio.id,
          name: row.studio.owner?.studio_name || row.studio.name,
          logo_url: row.studio.owner?.logo_url ?? null,
          brand_color: row.studio.owner?.brand_color ?? null,
          owner_name: row.studio.owner?.name ?? null,
        },
      },
    })
  })
}
