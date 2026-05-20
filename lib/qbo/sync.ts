// Push hejmae entities into QuickBooks.
//
// Each `sync*` function is idempotent: if a qbo_external_refs row already
// exists, it updates the QBO entity; otherwise it creates one. The new
// (or refreshed) ref + sync_token is persisted on success. Every attempt
// is logged to qbo_sync_log.
//
// Sync chains: invoice depends on customer, payment depends on invoice +
// customer, expense depends on optional vendor + two account mappings.
// We resolve dependencies recursively (sync the customer first if needed,
// etc.) so a single `syncInvoice(invoiceId)` does the right thing.
//
// Fire-and-forget pattern: callers from write paths wrap with `void
// trySync*(designerId, id)`; failures become sync_log rows, never throw.

import { supabaseAdmin } from '@/lib/supabase/server'
import { qboFetch, QboNotConnectedError } from '@/lib/qbo/client'
import {
  getRef,
  upsertRef,
  writeSyncLog,
} from '@/lib/qbo/refs'
import {
  AccountMappingMissingError,
  requireAccountMapping,
} from '@/lib/qbo/accounts'
import {
  clientToCustomer,
  expenseToQbo,
  invoiceToQbo,
  journalEntryToQbo,
  paymentToQbo,
  vendorToVendor,
} from '@/lib/qbo/mappers'
import { getConnection } from '@/lib/qbo/connection'
import type {
  AccountRow,
  ClientRow,
  ExpenseRow,
  InvoiceLineItemRow,
  InvoiceRow,
  JournalEntryRow,
  JournalLineRow,
  PaymentRow,
  ProjectRow,
  QboEntityType,
  VendorRow,
} from '@/lib/supabase/types'

// ---------------------------------------------------------------------------
// Skip-when-not-connected gate. Sync paths short-circuit so callers don't
// have to check.
// ---------------------------------------------------------------------------

async function shouldSync(designerId: string): Promise<boolean> {
  const conn = await getConnection(designerId)
  return !!(conn && conn.status === 'active')
}

// ---------------------------------------------------------------------------
// Generic create-or-update over a QBO entity name. QBO uses the same POST
// endpoint for both — the presence of `Id` + `SyncToken` switches behaviour.
// ---------------------------------------------------------------------------

interface QboMutationResult {
  qboId: string
  syncToken: string
}

async function qboUpsert(
  designerId: string,
  entityName: string,
  payload: Record<string, unknown>,
): Promise<QboMutationResult> {
  const data = (await qboFetch(designerId, entityName.toLowerCase(), {
    method: 'POST',
    body: payload,
  })) as Record<string, { Id: string; SyncToken: string }>
  const entity = data[entityName]
  if (!entity?.Id) {
    throw new Error(`QBO ${entityName} upsert returned no Id`)
  }
  return { qboId: entity.Id, syncToken: entity.SyncToken ?? '0' }
}

// ---------------------------------------------------------------------------
// Logging wrapper — every public sync* function funnels through this.
// ---------------------------------------------------------------------------

async function runWithLog<T>(
  designerId: string,
  entityType: QboEntityType,
  hejmaeId: string,
  fn: () => Promise<{ qboId: string; result: T }>,
): Promise<T> {
  try {
    const { qboId, result } = await fn()
    await writeSyncLog({
      designerId,
      entityType,
      hejmaeId,
      qboId,
      direction: 'push',
      status: 'success',
    })
    return result
  } catch (err) {
    const e = err as Error & { status?: number }
    await writeSyncLog({
      designerId,
      entityType,
      hejmaeId,
      direction: 'push',
      status: 'error',
      errorCode: e.name,
      errorMessage: e.message?.slice(0, 1000) ?? null,
    })
    throw err
  }
}

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

export async function syncCustomer(
  designerId: string,
  clientId: string,
): Promise<string> {
  return runWithLog(designerId, 'customer', clientId, async () => {
    const sb = supabaseAdmin()
    const { data, error } = await sb
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .eq('designer_id', designerId)
      .single()
    if (error) throw error
    const client = data as ClientRow
    const existing = await getRef(designerId, 'customer', clientId)
    const payload = clientToCustomer(
      client,
      existing?.qbo_sync_token,
      existing?.qbo_id,
    )
    const res = await qboUpsert(designerId, 'Customer', payload)
    await upsertRef({
      designerId,
      entityType: 'customer',
      hejmaeId: clientId,
      qboId: res.qboId,
      syncToken: res.syncToken,
    })
    return { qboId: res.qboId, result: res.qboId }
  })
}

// ---------------------------------------------------------------------------
// Vendor
// ---------------------------------------------------------------------------

export async function syncVendor(
  designerId: string,
  vendorId: string,
): Promise<string> {
  return runWithLog(designerId, 'vendor', vendorId, async () => {
    const sb = supabaseAdmin()
    const { data, error } = await sb
      .from('vendors')
      .select('*')
      .eq('id', vendorId)
      .eq('designer_id', designerId)
      .single()
    if (error) throw error
    const vendor = data as VendorRow
    const existing = await getRef(designerId, 'vendor', vendorId)
    const payload = vendorToVendor(
      vendor,
      existing?.qbo_sync_token,
      existing?.qbo_id,
    )
    const res = await qboUpsert(designerId, 'Vendor', payload)
    await upsertRef({
      designerId,
      entityType: 'vendor',
      hejmaeId: vendorId,
      qboId: res.qboId,
      syncToken: res.syncToken,
    })
    return { qboId: res.qboId, result: res.qboId }
  })
}

// ---------------------------------------------------------------------------
// Default sales item — QBO requires every invoice line to reference an
// Item. We auto-create a single "Design Services" item per studio, linked
// to the user's mapped "design_fees" income account.
//
// Cached under entity_type='item', hejmae_id='__default__'.
// ---------------------------------------------------------------------------

const DEFAULT_ITEM_KEY = '__default__'

async function ensureDefaultSalesItem(designerId: string): Promise<string> {
  const cached = await getRef(designerId, 'item', DEFAULT_ITEM_KEY)
  if (cached) return cached.qbo_id

  // Find the user's design-income account and require it's mapped to QBO.
  const sb = supabaseAdmin()
  const { data: acct, error } = await sb
    .from('accounts')
    .select('id, system_key')
    .eq('designer_id', designerId)
    .eq('system_key', 'design_fees')
    .single()
  if (error || !acct) {
    throw new Error(
      'No design_fees account found in your chart of accounts. ' +
        'Re-run studio bootstrap or create one manually.',
    )
  }
  const incomeQboId = await requireAccountMapping(designerId, acct.id)

  const data = (await qboFetch(designerId, 'item', {
    method: 'POST',
    body: {
      Name: 'Design Services',
      Type: 'Service',
      IncomeAccountRef: { value: incomeQboId },
    },
  })) as { Item: { Id: string; SyncToken: string } }
  const qboId = data.Item.Id
  await upsertRef({
    designerId,
    entityType: 'item',
    hejmaeId: DEFAULT_ITEM_KEY,
    qboId,
    syncToken: data.Item.SyncToken,
  })
  return qboId
}

// ---------------------------------------------------------------------------
// Invoice
// ---------------------------------------------------------------------------

export async function syncInvoice(
  designerId: string,
  invoiceId: string,
): Promise<string> {
  return runWithLog(designerId, 'invoice', invoiceId, async () => {
    const sb = supabaseAdmin()
    const { data: inv, error } = await sb
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .eq('designer_id', designerId)
      .single()
    if (error) throw error
    const invoice = inv as InvoiceRow

    // Skip drafts and voided — push when actually sent.
    if (invoice.status === 'draft' || invoice.status === 'void') {
      return { qboId: '', result: '' }
    }

    const { data: proj, error: projErr } = await sb
      .from('projects')
      .select('*')
      .eq('id', invoice.project_id)
      .single()
    if (projErr) throw projErr
    const project = proj as ProjectRow
    if (!project.client_id) {
      throw new Error('Invoice project has no client — cannot push to QBO.')
    }

    const customerQboId = await syncCustomer(designerId, project.client_id)
    const defaultItemQboId = await ensureDefaultSalesItem(designerId)

    const { data: lines, error: linesErr } = await sb
      .from('invoice_line_items')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('position', { ascending: true })
    if (linesErr) throw linesErr
    const lineRows = (lines ?? []) as InvoiceLineItemRow[]

    const existing = await getRef(designerId, 'invoice', invoiceId)
    const payload = invoiceToQbo({
      invoice,
      lines: lineRows,
      customerQboId,
      defaultItemQboId,
      existingSyncToken: existing?.qbo_sync_token,
      existingQboId: existing?.qbo_id,
    })
    const res = await qboUpsert(designerId, 'Invoice', payload)
    await upsertRef({
      designerId,
      entityType: 'invoice',
      hejmaeId: invoiceId,
      qboId: res.qboId,
      syncToken: res.syncToken,
    })
    return { qboId: res.qboId, result: res.qboId }
  })
}

// ---------------------------------------------------------------------------
// Payment
// ---------------------------------------------------------------------------

export async function syncPayment(
  designerId: string,
  paymentId: string,
): Promise<string> {
  return runWithLog(designerId, 'payment', paymentId, async () => {
    const sb = supabaseAdmin()
    const { data, error } = await sb
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .eq('designer_id', designerId)
      .single()
    if (error) throw error
    const payment = data as PaymentRow

    // Need the invoice's qbo_id; push the invoice if it hasn't synced yet.
    const invoiceQboId = await syncInvoice(designerId, payment.invoice_id)
    if (!invoiceQboId) {
      throw new Error('Cannot push payment — parent invoice is draft/void.')
    }

    const { data: inv, error: invErr } = await sb
      .from('invoices')
      .select('project_id')
      .eq('id', payment.invoice_id)
      .single()
    if (invErr) throw invErr
    const { data: proj, error: projErr } = await sb
      .from('projects')
      .select('client_id')
      .eq('id', inv.project_id)
      .single()
    if (projErr) throw projErr
    if (!proj.client_id) {
      throw new Error('Payment project has no client — cannot push to QBO.')
    }
    const customerQboId = await syncCustomer(designerId, proj.client_id)

    const existing = await getRef(designerId, 'payment', paymentId)
    const payload = paymentToQbo({
      payment,
      customerQboId,
      invoiceQboId,
      existingSyncToken: existing?.qbo_sync_token,
      existingQboId: existing?.qbo_id,
    })
    const res = await qboUpsert(designerId, 'Payment', payload)
    await upsertRef({
      designerId,
      entityType: 'payment',
      hejmaeId: paymentId,
      qboId: res.qboId,
      syncToken: res.syncToken,
    })
    return { qboId: res.qboId, result: res.qboId }
  })
}

// ---------------------------------------------------------------------------
// Expense → QBO Purchase
// ---------------------------------------------------------------------------

function paymentTypeFor(account: AccountRow): 'Cash' | 'CreditCard' | 'Check' {
  // Heuristic: credit-card account → CreditCard; otherwise Cash. Check is
  // a manual override surface we'll add later if needed.
  if (account.system_key === 'credit_card' || account.type === 'liability') {
    return 'CreditCard'
  }
  return 'Cash'
}

export async function syncExpense(
  designerId: string,
  expenseId: string,
): Promise<string> {
  return runWithLog(designerId, 'expense', expenseId, async () => {
    const sb = supabaseAdmin()
    const { data: exp, error } = await sb
      .from('expenses')
      .select('*')
      .eq('id', expenseId)
      .eq('designer_id', designerId)
      .single()
    if (error) throw error
    const expense = exp as ExpenseRow

    const { data: payAcct, error: payErr } = await sb
      .from('accounts')
      .select('*')
      .eq('id', expense.payment_account_id)
      .single()
    if (payErr) throw payErr
    const paymentAccount = payAcct as AccountRow

    const paymentAccountQboId = await requireAccountMapping(
      designerId,
      expense.payment_account_id,
    )
    const categoryAccountQboId = await requireAccountMapping(
      designerId,
      expense.category_account_id,
    )

    const vendorQboId = expense.vendor_id
      ? await syncVendor(designerId, expense.vendor_id)
      : null

    const existing = await getRef(designerId, 'expense', expenseId)
    const payload = expenseToQbo({
      expense,
      paymentAccountQboId,
      categoryAccountQboId,
      vendorQboId,
      paymentType: paymentTypeFor(paymentAccount),
      existingSyncToken: existing?.qbo_sync_token,
      existingQboId: existing?.qbo_id,
    })
    const res = await qboUpsert(designerId, 'Purchase', payload)
    await upsertRef({
      designerId,
      entityType: 'expense',
      hejmaeId: expenseId,
      qboId: res.qboId,
      syncToken: res.syncToken,
    })
    return { qboId: res.qboId, result: res.qboId }
  })
}

// ---------------------------------------------------------------------------
// Journal entry
//
// Only manual JEs sync — auto-posted ones (source_type='payment'|'expense'
// |'mileage') would double-count on the QBO side, since we already sync
// payments and expenses as native QBO entities.
// ---------------------------------------------------------------------------

export async function syncJournalEntry(
  designerId: string,
  entryId: string,
): Promise<string> {
  return runWithLog(designerId, 'journal_entry', entryId, async () => {
    const sb = supabaseAdmin()
    const { data: entryData, error } = await sb
      .from('journal_entries')
      .select('*')
      .eq('id', entryId)
      .eq('designer_id', designerId)
      .single()
    if (error) throw error
    const entry = entryData as JournalEntryRow
    if (entry.source_type !== 'manual') {
      // Skip silently — not an error, just nothing to sync.
      return { qboId: '', result: '' }
    }

    const { data: lineRows, error: linesErr } = await sb
      .from('journal_lines')
      .select('*')
      .eq('entry_id', entryId)
      .order('position', { ascending: true })
    if (linesErr) throw linesErr
    const lines = (lineRows ?? []) as JournalLineRow[]

    const enriched = await Promise.all(
      lines.map(async (l) => ({
        line: l,
        accountQboId: await requireAccountMapping(designerId, l.account_id),
      })),
    )

    const existing = await getRef(designerId, 'journal_entry', entryId)
    const payload = journalEntryToQbo({
      entry,
      lines: enriched,
      existingSyncToken: existing?.qbo_sync_token,
      existingQboId: existing?.qbo_id,
    })
    const res = await qboUpsert(designerId, 'JournalEntry', payload)
    await upsertRef({
      designerId,
      entityType: 'journal_entry',
      hejmaeId: entryId,
      qboId: res.qboId,
      syncToken: res.syncToken,
    })
    return { qboId: res.qboId, result: res.qboId }
  })
}

// ---------------------------------------------------------------------------
// Fire-and-forget wrappers for write paths. Soft-fail — sync errors go to
// the log, not to the user's response.
// ---------------------------------------------------------------------------

function fireAndForget(
  designerId: string,
  fn: (designerId: string) => Promise<unknown>,
): void {
  void (async () => {
    try {
      if (!(await shouldSync(designerId))) return
      await fn(designerId)
    } catch (e) {
      if (e instanceof QboNotConnectedError) return
      if (e instanceof AccountMappingMissingError) return // already logged
      console.error('[qbo] background sync failed', e)
    }
  })()
}

export function trySyncCustomer(designerId: string, clientId: string): void {
  fireAndForget(designerId, (d) => syncCustomer(d, clientId))
}
export function trySyncVendor(designerId: string, vendorId: string): void {
  fireAndForget(designerId, (d) => syncVendor(d, vendorId))
}
export function trySyncInvoice(designerId: string, invoiceId: string): void {
  fireAndForget(designerId, (d) => syncInvoice(d, invoiceId))
}
export function trySyncPayment(designerId: string, paymentId: string): void {
  fireAndForget(designerId, (d) => syncPayment(d, paymentId))
}
export function trySyncExpense(designerId: string, expenseId: string): void {
  fireAndForget(designerId, (d) => syncExpense(d, expenseId))
}
export function trySyncJournalEntry(designerId: string, entryId: string): void {
  fireAndForget(designerId, (d) => syncJournalEntry(d, entryId))
}

// ---------------------------------------------------------------------------
// Manual resync — used by the settings UI's "Resync" buttons.
// ---------------------------------------------------------------------------

const ENTITY_DISPATCH: Record<
  Exclude<QboEntityType, 'account' | 'item'>,
  (designerId: string, id: string) => Promise<string>
> = {
  customer: syncCustomer,
  vendor: syncVendor,
  invoice: syncInvoice,
  payment: syncPayment,
  expense: syncExpense,
  journal_entry: syncJournalEntry,
}

export async function manualResync(
  designerId: string,
  entityType: QboEntityType,
  hejmaeId: string,
): Promise<string> {
  if (entityType === 'account' || entityType === 'item') {
    throw new Error(`Cannot manually resync ${entityType}.`)
  }
  return ENTITY_DISPATCH[entityType](designerId, hejmaeId)
}
