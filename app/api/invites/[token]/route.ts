// Public preview of an invite by token. Returns enough for the landing page
// to render before sign-in. Does NOT require auth — knowing the token is the
// authorization.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, notFound, tooManyRequests } from '@/lib/errors'
import { hashToken } from '@/lib/tokens'
import { checkRateLimit, callerIp } from '@/lib/ratelimit'
import { resolveAssetUrl } from '@/lib/storage'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  return withErrorHandling(async () => {
    const { token } = await params
    const [rlIp, rlTok] = await Promise.all([
      checkRateLimit('portal', callerIp(req)),
      checkRateLimit('portalToken', hashToken(token)),
    ])
    if (!rlIp.ok || !rlTok.ok) throw tooManyRequests()
    const sb = supabaseAdmin()

    const { data, error } = await sb
      .from('studio_invites')
      .select(
        'id, email, role, accepted_at, revoked_at, expires_at, studio:studios!inner(id, name, owner:users!studios_owner_user_id_fkey(name, studio_name, logo_url, brand_color))',
      )
      .eq('token', hashToken(token))
      .maybeSingle()
    if (error) throw error
    if (!data) throw notFound('Invite not found')

    type Row = {
      id: string
      email: string
      role: string
      accepted_at: string | null
      revoked_at: string | null
      expires_at: string | null
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
    const expired =
      !!row.expires_at && new Date(row.expires_at).getTime() < Date.now()

    return NextResponse.json({
      data: {
        id: row.id,
        email: row.email,
        role: row.role,
        status: row.revoked_at
          ? 'revoked'
          : row.accepted_at
            ? 'accepted'
            : expired
              ? 'expired'
              : 'pending',
        studio: {
          id: row.studio.id,
          name: row.studio.owner?.studio_name || row.studio.name,
          logo_url: await resolveAssetUrl(row.studio.owner?.logo_url ?? null),
          brand_color: row.studio.owner?.brand_color ?? null,
          owner_name: row.studio.owner?.name ?? null,
        },
      },
    })
  })
}
