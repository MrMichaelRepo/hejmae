// Import open A/R invoices from QBO into hejmae.
//
// QBO invoices aren't project-scoped. We auto-create a single per-studio
// project named "QuickBooks import" and assign every imported invoice to
// it; the designer can move them into real projects post-cutover.
//
// Each QBO invoice becomes one hejmae invoice + N line items. If the QBO
// invoice is partially paid (Balance < TotalAmt), we insert a single
// payments row of (TotalAmt − Balance) so hejmae's status math lands on
// 'partially_paid' or 'paid' to match QB.
//
// Customers referenced by imported invoices MUST already be imported (by
// running the customer importer first). Otherwise the row is skipped with
// a clear reason.
//
// Bills (A/P) are out of scope for this importer — hejmae doesn't model
// "bills" as a distinct entity. Outstanding bills should be re-entered as
// expenses post-cutover.

import { supabaseAdmin } from '@/lib/supabase/server'
import { qboFetch } from '@/lib/qbo/client'
import { getRefByQboId, upsertRef } from '@/lib/qbo/refs'

const IMPORT_PROJECT_NAME = 'QuickBooks import'

interface RawQboInvoiceLine {
  DetailType?: string
  Amount?: number
  Description?: string
  SalesItemLineDetail?: {
    Qty?: number
    UnitPrice?: number
  }
}

interface RawQboInvoice {
  Id: string
  DocNumber?: string
  TxnDate: string
  DueDate?: string
  TotalAmt: number
  Balance: number
  CustomerRef: { value: string; name?: string }
  PrivateNote?: string
  CustomerMemo?: { value?: string }
  Line: RawQboInvoiceLine[]
}

export interface InvoiceImportPreviewRow {
  qboId: string
  qboDocNumber: string | null
  qboCustomerName: string
  totalCents: number
  balanceCents: number
  alreadyImported: boolean
  customerMissing: boolean
  txnDate: string
  lineCount: number
}

async function ensureImportProject(designerId: string): Promise<string> {
  const sb = supabaseAdmin()
  const { data: existing } = await sb
    .from('projects')
    .select('id')
    .eq('designer_id', designerId)
    .eq('name', IMPORT_PROJECT_NAME)
    .maybeSingle()
  if (existing) return existing.id
  const { data: created, error } = await sb
    .from('projects')
    .insert({
      designer_id: designerId,
      name: IMPORT_PROJECT_NAME,
      status: 'active',
      notes:
        'Holding project for historical invoices imported from QuickBooks. ' +
        'Reassign individual invoices to real projects when ready.',
    })
    .select('id')
    .single()
  if (error) throw error
  return created.id
}

async function fetchOpenQboInvoices(designerId: string): Promise<RawQboInvoice[]> {
  // Open A/R: Balance > 0. We also pull invoices with Balance = 0 that
  // were created in QBO recently? No — those are already fully settled in
  // QB and re-importing them would only matter for historical reports. The
  // trial-balance opening JE covers the dollars; importing zero-balance
  // invoices would just clutter hejmae's history. Skip them.
  const data = (await qboFetch(designerId, 'query', {
    query: { query: "SELECT * FROM Invoice WHERE Balance > '0' MAXRESULTS 1000" },
  })) as { QueryResponse?: { Invoice?: RawQboInvoice[] } }
  return data.QueryResponse?.Invoice ?? []
}

export async function previewInvoiceImport(
  designerId: string,
): Promise<InvoiceImportPreviewRow[]> {
  const sb = supabaseAdmin()
  const [qbInvoices, refsRes] = await Promise.all([
    fetchOpenQboInvoices(designerId),
    sb
      .from('qbo_external_refs')
      .select('hejmae_id, qbo_id, entity_type')
      .eq('designer_id', designerId)
      .in('entity_type', ['customer', 'invoice']),
  ])
  if (refsRes.error) throw refsRes.error
  const customerByQboId = new Map<string, string>() // qbo customer id → hejmae client id
  const invoiceByQboId = new Map<string, string>()
  for (const r of refsRes.data ?? []) {
    const row = r as { hejmae_id: string; qbo_id: string; entity_type: string }
    if (row.entity_type === 'customer') customerByQboId.set(row.qbo_id, row.hejmae_id)
    if (row.entity_type === 'invoice') invoiceByQboId.set(row.qbo_id, row.hejmae_id)
  }

  return qbInvoices.map((inv) => ({
    qboId: inv.Id,
    qboDocNumber: inv.DocNumber ?? null,
    qboCustomerName: inv.CustomerRef.name ?? '—',
    totalCents: Math.round(inv.TotalAmt * 100),
    balanceCents: Math.round(inv.Balance * 100),
    alreadyImported: invoiceByQboId.has(inv.Id),
    customerMissing: !customerByQboId.has(inv.CustomerRef.value),
    txnDate: inv.TxnDate,
    lineCount: inv.Line.filter(
      (l) => l.DetailType === 'SalesItemLineDetail',
    ).length,
  }))
}

export interface InvoiceImportResult {
  created: number
  skipped: number
  errors: Array<{ qboId: string; message: string }>
}

export async function applyInvoiceImport(
  designerId: string,
): Promise<InvoiceImportResult> {
  const sb = supabaseAdmin()
  const result: InvoiceImportResult = { created: 0, skipped: 0, errors: [] }

  const qbInvoices = await fetchOpenQboInvoices(designerId)
  if (qbInvoices.length === 0) return result

  const projectId = await ensureImportProject(designerId)

  for (const inv of qbInvoices) {
    try {
      // Skip if already imported.
      const existing = await getRefByQboId(designerId, 'invoice', inv.Id)
      if (existing) {
        result.skipped++
        continue
      }
      // Customer must be imported first.
      const customerRef = await getRefByQboId(
        designerId,
        'customer',
        inv.CustomerRef.value,
      )
      if (!customerRef) {
        result.errors.push({
          qboId: inv.Id,
          message: `Customer "${inv.CustomerRef.name ?? inv.CustomerRef.value}" not imported yet — run the customer import first.`,
        })
        continue
      }

      const lines = inv.Line.filter(
        (l) => l.DetailType === 'SalesItemLineDetail',
      )
      const totalCents = Math.round(inv.TotalAmt * 100)
      const balanceCents = Math.round(inv.Balance * 100)
      const paidCents = Math.max(0, totalCents - balanceCents)
      const status =
        paidCents <= 0 ? 'sent' : paidCents >= totalCents ? 'paid' : 'partially_paid'

      const note = [
        inv.DocNumber ? `QuickBooks invoice #${inv.DocNumber}` : 'Imported from QuickBooks',
        inv.PrivateNote,
        inv.CustomerMemo?.value,
      ]
        .filter(Boolean)
        .join('\n\n')

      const { data: invoiceRow, error: invErr } = await sb
        .from('invoices')
        .insert({
          designer_id: designerId,
          project_id: projectId,
          type: 'progress',
          status,
          total_cents: totalCents,
          notes: note,
          sent_at: inv.TxnDate,
          paid_at: status === 'paid' ? new Date().toISOString() : null,
        })
        .select('id')
        .single()
      if (invErr) throw invErr
      const newInvoiceId = invoiceRow.id

      // Lines.
      if (lines.length > 0) {
        const { error: lineErr } = await sb.from('invoice_line_items').insert(
          lines.map((l, i) => {
            const totalLineCents = Math.round((l.Amount ?? 0) * 100)
            const qty = l.SalesItemLineDetail?.Qty ?? 1
            const unitPriceCents = qty > 0 ? Math.round(totalLineCents / qty) : totalLineCents
            return {
              designer_id: designerId,
              invoice_id: newInvoiceId,
              item_id: null,
              description: l.Description ?? 'Imported line',
              quantity: qty,
              unit_price_cents: unitPriceCents,
              total_price_cents: totalLineCents,
              position: i,
            }
          }),
        )
        if (lineErr) throw lineErr
      } else {
        // QBO sometimes returns invoices with only group/subtotal lines.
        // Insert a single catch-all so the invoice has at least one row.
        const { error: lineErr } = await sb.from('invoice_line_items').insert({
          designer_id: designerId,
          invoice_id: newInvoiceId,
          item_id: null,
          description: 'Imported from QuickBooks',
          quantity: 1,
          unit_price_cents: totalCents,
          total_price_cents: totalCents,
          position: 0,
        })
        if (lineErr) throw lineErr
      }

      // Partial-payment stub so status math matches QB's balance.
      if (paidCents > 0) {
        const { error: payErr } = await sb.from('payments').insert({
          designer_id: designerId,
          invoice_id: newInvoiceId,
          amount_cents: paidCents,
          stripe_charge_id: null,
          stripe_payment_intent_id: null,
          platform_fee_cents: 0,
          received_at: inv.TxnDate,
        })
        if (payErr) throw payErr
      }

      await upsertRef({
        designerId,
        entityType: 'invoice',
        hejmaeId: newInvoiceId,
        qboId: inv.Id,
      })
      result.created++
    } catch (e) {
      result.errors.push({ qboId: inv.Id, message: (e as Error).message })
    }
  }

  return result
}
