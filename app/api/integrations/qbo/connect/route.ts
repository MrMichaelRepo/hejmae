// Start the QuickBooks Online OAuth handshake.
//
// Returns `{ authorize_url }` — the client navigates to it. The `state`
// parameter binds the request to the current designer; the callback route
// verifies it on the way back.
import { NextResponse } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requireRole } from '@/lib/auth/permissions'
import { withErrorHandling, serverError } from '@/lib/errors'
import { buildAuthorizeUrl, isQboConfigured, signState } from '@/lib/qbo/oauth'

export async function POST() {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requireRole(ctx, 'owner')
    if (!isQboConfigured()) {
      throw serverError(
        'QuickBooks integration is not configured on this deployment.',
      )
    }
    const state = signState(ctx.designerId)
    const authorize_url = buildAuthorizeUrl(state)
    return NextResponse.json({ authorize_url })
  })
}
