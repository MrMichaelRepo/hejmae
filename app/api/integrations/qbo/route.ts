// QBO connection status + disconnect.
//
// GET  → { configured, connection: { realm_id, environment, status, ... } | null,
//          company?: { companyName, ... } }
// DELETE → revokes the refresh token with Intuit (best-effort) and deletes
//          the qbo_connections row.

import { NextResponse } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requireRole } from '@/lib/auth/permissions'
import { withErrorHandling } from '@/lib/errors'
import { deleteConnection, getConnection } from '@/lib/qbo/connection'
import { isQboConfigured, revokeToken } from '@/lib/qbo/oauth'
import { getCompanyInfo, type QboCompanyInfo } from '@/lib/qbo/client'
import type { QboConnectionRow } from '@/lib/supabase/types'

interface QboStatusResponse {
  configured: boolean
  connection: QboConnectionRow | null
  company: QboCompanyInfo | null
}

export async function GET() {
  return withErrorHandling<QboStatusResponse>(async () => {
    const ctx = await requireDesigner()
    const configured = isQboConfigured()
    if (!configured) {
      return NextResponse.json({ configured: false, connection: null, company: null })
    }
    const connection = await getConnection(ctx.designerId)
    if (!connection || connection.status !== 'active') {
      return NextResponse.json({ configured, connection, company: null })
    }
    // Smoke-test the connection so the UI can show the QB company name.
    // Soft-fail: a failed CompanyInfo call shouldn't 500 the settings page.
    let company: QboCompanyInfo | null = null
    try {
      company = await getCompanyInfo(ctx.designerId)
    } catch (e) {
      console.error('[qbo] companyinfo fetch failed', e)
    }
    return NextResponse.json({ configured, connection, company })
  })
}

export async function DELETE() {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requireRole(ctx, 'owner')
    const refreshToken = await deleteConnection(ctx.designerId)
    if (refreshToken && isQboConfigured()) {
      try {
        await revokeToken(refreshToken)
      } catch (e) {
        // Local row is already gone; if Intuit revoke fails the token
        // will simply age out. Log and move on.
        console.error('[qbo] revoke failed', e)
      }
    }
    return NextResponse.json({ ok: true })
  })
}
