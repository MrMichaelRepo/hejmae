import { type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'
import { getForm1099Summary } from '@/lib/finances/form_1099'
import { csvBody, csvResponse, csvRow, dollars } from '@/lib/finances/csv'

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requirePermission(ctx, 'finances:view')
    const url = new URL(req.url)
    const yr = parseInt(url.searchParams.get('year') ?? '', 10)
    const taxYear = Number.isFinite(yr) ? yr : new Date().getUTCFullYear()
    const summary = await getForm1099Summary(ctx.designerId, taxYear)

    // Pull addresses + last4 to enrich the CSV (TIN full intentionally not
    // exported — we display last 4 only for paper trail; full TIN should
    // come off your W-9 file, not this CSV).
    const ids = summary.rows.map((r) => r.vendor_id)
    let vendorAddrs: Record<string, {
      legal_name: string | null
      tax_id_last4: string | null
      address_line1: string | null
      address_line2: string | null
      address_city: string | null
      address_state: string | null
      address_postal_code: string | null
    }> = {}
    if (ids.length > 0) {
      const { data } = await supabaseAdmin()
        .from('vendors')
        .select(
          'id, legal_name, tax_id_last4, address_line1, address_line2, address_city, address_state, address_postal_code',
        )
        .in('id', ids)
      for (const v of data ?? []) {
        vendorAddrs[v.id] = {
          legal_name: v.legal_name,
          tax_id_last4: v.tax_id_last4,
          address_line1: v.address_line1,
          address_line2: v.address_line2,
          address_city: v.address_city,
          address_state: v.address_state,
          address_postal_code: v.address_postal_code,
        }
      }
    }

    const rows: string[] = []
    rows.push(`1099-NEC vendor totals · Tax year ${taxYear}`)
    rows.push('')
    rows.push(
      csvRow([
        'Vendor',
        'Legal name (W-9)',
        'TIN last 4',
        'Address',
        'City',
        'State',
        'ZIP',
        '1099 eligible',
        'YTD paid',
        'Status',
      ]),
    )
    for (const r of summary.rows) {
      const a = vendorAddrs[r.vendor_id] ?? null
      const status = r.needs_1099
        ? '1099 required'
        : r.threshold_unflagged
          ? 'Review'
          : r.is_1099_eligible
            ? 'Below threshold'
            : 'Not eligible'
      rows.push(
        csvRow([
          r.name,
          a?.legal_name ?? '',
          a?.tax_id_last4 ? `…${a.tax_id_last4}` : '',
          [a?.address_line1, a?.address_line2].filter(Boolean).join(' '),
          a?.address_city ?? '',
          a?.address_state ?? '',
          a?.address_postal_code ?? '',
          r.is_1099_eligible ? 'yes' : 'no',
          dollars(r.ytd_paid_cents),
          status,
        ]),
      )
    }
    if (summary.unmatched_count > 0) {
      rows.push('')
      rows.push(
        `${summary.unmatched_count} expense(s) totaling ${dollars(summary.unmatched_total_cents)} were entered as free-text vendors (no vendor record). Link these to vendors before issuing 1099s.`,
      )
    }
    return csvResponse(`hejmae-1099_${taxYear}.csv`, csvBody(rows))
  })
}
