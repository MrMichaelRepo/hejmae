// POST /api/cron/catalog-duplicate-scan
//
// Triggered by Supabase pg_cron (every Monday 06:00 UTC) via the http
// extension, or by an authorized operator for backfills. Authenticates
// via a shared CRON_SECRET passed in the Authorization header so this
// route is never publicly callable.
//
// After the scan completes, sends a plain summary email to
// ADMIN_ALERT_EMAIL (falls back to the Resend From address) describing
// the scan's outcome. Both the scan and the email soft-fail to log only
// rather than 500ing the cron worker.

import { NextResponse, type NextRequest } from 'next/server'
import { withErrorHandling, unauthorized, serverError } from '@/lib/errors'
import { env } from '@/lib/env'
import { runDuplicateScan, type ScanResult } from '@/lib/admin/duplicate-scan'
import { supabaseAdmin } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    assertCronAuthorized(req)

    const result = await runDuplicateScan()
    const totals = await loadUnresolvedTotals()

    void sendSummaryEmail(result, totals)

    return NextResponse.json({ data: { ...result, ...totals }, error: null })
  })
}

// Allow GET as well so it can be tested from a browser by an operator
// who knows the secret. Same handler.
export async function GET(req: NextRequest) {
  return POST(req)
}

function assertCronAuthorized(req: NextRequest): void {
  const secret = env.cronSecret()
  if (!secret) {
    throw serverError('Cron jobs are not configured on this deployment', {
      hint: 'CRON_SECRET',
    })
  }
  const header =
    req.headers.get('authorization') ?? req.headers.get('Authorization')
  // Accept either "Bearer <secret>" or the raw secret for tools that
  // can't set Authorization easily (some pg_cron HTTP wrappers).
  const presented = header?.startsWith('Bearer ')
    ? header.slice('Bearer '.length).trim()
    : (header?.trim() ?? null)
  if (!presented || !timingSafeEqual(presented, secret)) {
    throw unauthorized('Invalid cron credentials')
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

async function loadUnresolvedTotals(): Promise<{
  total_unresolved: number
  total_resolved_30d: number
}> {
  const sb = supabaseAdmin()
  const [{ count: unresolved }, { count: resolved30 }] = await Promise.all([
    sb
      .from('catalog_duplicate_flags')
      .select('id', { count: 'exact', head: true })
      .eq('resolved', false),
    sb
      .from('catalog_duplicate_flags')
      .select('id', { count: 'exact', head: true })
      .eq('resolved', true)
      .gte(
        'resolved_at',
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      ),
  ])
  return {
    total_unresolved: unresolved ?? 0,
    total_resolved_30d: resolved30 ?? 0,
  }
}

async function sendSummaryEmail(
  result: ScanResult,
  totals: { total_unresolved: number; total_resolved_30d: number },
): Promise<void> {
  try {
    const to = env.adminAlertEmail() ?? env.resendFromEmail()
    const appUrl = (() => {
      try {
        return env.appUrl()
      } catch {
        return null
      }
    })()
    const link = appUrl
      ? `${appUrl.replace(/\/$/, '')}/admin/duplicates`
      : '/admin/duplicates'
    const subject = `Catalog duplicate scan — ${result.new_flags_created} new flags, ${totals.total_unresolved} total unresolved`

    const html = `
      <div style="font-family:Georgia,serif;color:#1a1a1a;">
        <h2 style="margin:0 0 12px">Weekly catalog duplicate scan</h2>
        <ul style="line-height:1.6">
          <li>New products scanned: <strong>${result.new_products_scanned}</strong></li>
          <li>New flags created: <strong>${result.new_flags_created}</strong></li>
          <li>Existing unresolved flags refreshed: <strong>${result.flags_refreshed}</strong></li>
          <li>Resolved flags skipped: <strong>${result.resolved_flags_skipped}</strong></li>
        </ul>
        <p style="margin-top:16px">
          Total unresolved (all-time): <strong>${totals.total_unresolved}</strong><br/>
          Resolved in the last 30 days: <strong>${totals.total_resolved_30d}</strong>
        </p>
        <p>
          <a href="${link}" style="color:#1a1a1a">Open admin dashboard →</a>
        </p>
      </div>
    `
    const text = [
      'Weekly catalog duplicate scan',
      `New products scanned: ${result.new_products_scanned}`,
      `New flags created: ${result.new_flags_created}`,
      `Existing unresolved flags refreshed: ${result.flags_refreshed}`,
      `Resolved flags skipped: ${result.resolved_flags_skipped}`,
      `Total unresolved: ${totals.total_unresolved}`,
      `Resolved in the last 30 days: ${totals.total_resolved_30d}`,
      `Admin dashboard: ${link}`,
    ].join('\n')

    await sendEmail({ to, subject, html, text })
  } catch (err) {
    console.error(
      '[duplicate-scan] summary email failed',
      err instanceof Error ? err.message : err,
    )
  }
}
