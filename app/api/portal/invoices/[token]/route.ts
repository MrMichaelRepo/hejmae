// Client portal: view an invoice by magic-link token.
import { NextResponse, type NextRequest } from 'next/server'
import { loadInvoiceByToken } from '@/lib/portal/auth'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, tooManyRequests } from '@/lib/errors'
import { stripTrade } from '@/lib/portal/sanitize'
import { checkRateLimit, callerIp } from '@/lib/ratelimit'
import { hashToken } from '@/lib/tokens'
import { resolveAssetUrl } from '@/lib/storage'

interface Ctx {
  params: Promise<{ token: string }>
}

export async function GET(req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { token } = await params
    const [rlIp, rlTok] = await Promise.all([
      checkRateLimit('portal', callerIp(req)),
      checkRateLimit('portalToken', hashToken(token)),
    ])
    if (!rlIp.ok || !rlTok.ok) throw tooManyRequests()
    const { invoice, lines } = await loadInvoiceByToken(token)

    const sb = supabaseAdmin()
    const [{ data: project }, { data: designer }] = await Promise.all([
      sb
        .from('projects')
        .select('id, name, location')
        .eq('id', invoice.project_id)
        .maybeSingle(),
      sb
        .from('users')
        .select('studio_name, name, logo_url, brand_color')
        .eq('id', invoice.designer_id)
        .maybeSingle(),
    ])

    const designerOut = designer
      ? { ...designer, logo_url: await resolveAssetUrl(designer.logo_url) }
      : null

    const payload = stripTrade({
      invoice: {
        id: invoice.id,
        type: invoice.type,
        status: invoice.status,
        total_cents: invoice.total_cents,
        sent_at: invoice.sent_at,
        paid_at: invoice.paid_at,
        notes: invoice.notes,
      },
      project,
      designer: designerOut,
      lines: lines.map((l) => ({
        id: l.id,
        description: l.description,
        quantity: l.quantity,
        unit_price_cents: l.unit_price_cents,
        total_price_cents: l.total_price_cents,
        position: l.position,
      })),
    })

    return NextResponse.json({ data: payload })
  })
}
