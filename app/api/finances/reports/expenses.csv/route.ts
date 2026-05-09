import { type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'
import { csvBody, csvResponse, csvRow, dollars } from '@/lib/finances/csv'

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requirePermission(ctx, 'finances:view')
    const url = new URL(req.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const categoryId = url.searchParams.get('category_id')
    const projectId = url.searchParams.get('project_id')
    const paymentAcctId = url.searchParams.get('payment_account_id')
    const billable = url.searchParams.get('billable')

    const sb = supabaseAdmin()
    let q = sb
      .from('expenses')
      .select(
        'id, expense_date, amount_cents, vendor_name, description, billable_to_client, reconciled_at, vendor_id, project_id, category_account_id, payment_account_id',
      )
      .eq('designer_id', ctx.designerId)
      .order('expense_date', { ascending: false })
    if (from) q = q.gte('expense_date', from)
    if (to) q = q.lte('expense_date', to)
    if (categoryId) q = q.eq('category_account_id', categoryId)
    if (projectId === '__studio__') q = q.is('project_id', null)
    else if (projectId) q = q.eq('project_id', projectId)
    if (paymentAcctId) q = q.eq('payment_account_id', paymentAcctId)
    if (billable === 'true') q = q.eq('billable_to_client', true)
    const { data: expenses, error } = await q
    if (error) throw error

    const accounts = await sb
      .from('accounts')
      .select('id, code, name')
      .eq('designer_id', ctx.designerId)
    const projects = await sb
      .from('projects')
      .select('id, name')
      .eq('designer_id', ctx.designerId)
    const vendors = await sb
      .from('vendors')
      .select('id, name')
      .eq('designer_id', ctx.designerId)

    const accIx = new Map((accounts.data ?? []).map((a) => [a.id, a]))
    const projIx = new Map((projects.data ?? []).map((p) => [p.id, p]))
    const venIx = new Map((vendors.data ?? []).map((v) => [v.id, v]))

    const rows: string[] = []
    rows.push('Expenses export')
    rows.push('')
    rows.push(
      csvRow([
        'Date',
        'Vendor',
        'Category code',
        'Category',
        'Project',
        'Paid from',
        'Description',
        'Amount',
        'Billable',
        'Reconciled',
      ]),
    )
    let total = 0
    for (const e of expenses ?? []) {
      total += e.amount_cents
      const cat = accIx.get(e.category_account_id)
      const pay = accIx.get(e.payment_account_id)
      const vn = e.vendor_id ? venIx.get(e.vendor_id)?.name : null
      rows.push(
        csvRow([
          e.expense_date,
          vn ?? e.vendor_name ?? '',
          cat?.code ?? '',
          cat?.name ?? '',
          e.project_id ? projIx.get(e.project_id)?.name ?? '' : 'Studio',
          pay?.name ?? '',
          e.description ?? '',
          dollars(e.amount_cents),
          e.billable_to_client ? 'yes' : 'no',
          e.reconciled_at ? 'yes' : 'no',
        ]),
      )
    }
    rows.push('')
    rows.push(csvRow(['', '', '', '', '', '', 'Total', dollars(total), '', '']))
    return csvResponse('hejmae-expenses.csv', csvBody(rows))
  })
}
