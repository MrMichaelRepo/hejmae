// GET /api/me — minimal designer profile used by the Hejmae Clipper
// extension to render "you're signed in as …" without having to pull
// the full /api/settings payload. Returns the *caller's* user row, not
// the studio owner's.

import { NextResponse } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { withErrorHandling } from '@/lib/errors'
import { withSignedUrls } from '@/lib/storage'

export async function GET() {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    const signed = await withSignedUrls(ctx.user, ['logo_url'] as const)
    return NextResponse.json({
      data: {
        id: ctx.userId,
        email: signed?.email ?? ctx.user.email,
        name: signed?.name ?? ctx.user.name,
        logo_url: signed?.logo_url ?? null,
        studio_id: ctx.studioId,
        role: ctx.role,
      },
    })
  })
}
