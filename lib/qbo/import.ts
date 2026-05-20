// Import from QuickBooks Online into hejmae.
//
// Three entity types live here: accounts (chart of accounts), customers
// (→ clients), vendors. Invoices and trial-balance imports are in their
// own files since they have wider dependencies.
//
// Each importer has two phases:
//   * preview(): pull from QBO, compute a per-row proposed action
//     (create / merge / skip) by name-matching against existing hejmae rows.
//   * apply():   execute the proposal. Persists qbo_external_refs rows so
//     subsequent Phase-B pushes target the same QBO entity.
//
// Merge-by-name is case-insensitive (matches the vendors uniqueness index).
// On merge, we never overwrite existing hejmae fields — we only fill in
// blanks. The user's edits in hejmae take precedence.

import { supabaseAdmin } from '@/lib/supabase/server'
import { qboFetch } from '@/lib/qbo/client'
import { upsertRef } from '@/lib/qbo/refs'
import type {
  AccountRow,
  AccountType,
  ClientRow,
  VendorRow,
} from '@/lib/supabase/types'

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type ImportAction = 'create' | 'merge' | 'skip' | 'mapped'

export interface ImportProposalRow<T> {
  qboId: string
  qboName: string
  action: ImportAction
  // Existing hejmae row matched by name (for merge) or already linked (mapped).
  existingHejmaeId?: string | null
  preview: T
  // If skip, why.
  skipReason?: string
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

interface RawQboAccount {
  Id: string
  Name: string
  FullyQualifiedName: string
  AccountType: string
  AccountSubType?: string
  Classification?: string
  AcctNum?: string
  Active: boolean
  Description?: string
}

function qboClassificationToType(qboClassification: string | undefined, qboType: string): AccountType {
  // QBO's Classification is the cleanest signal (Asset/Liability/Equity/
  // Revenue/Expense). Fall back to AccountType heuristics.
  if (qboClassification === 'Asset') return 'asset'
  if (qboClassification === 'Liability') return 'liability'
  if (qboClassification === 'Equity') return 'equity'
  if (qboClassification === 'Revenue') return 'income'
  if (qboClassification === 'Expense') return 'expense'
  // Heuristic fallback on AccountType.
  const lower = qboType.toLowerCase()
  if (lower.includes('asset') || lower === 'bank' || lower === 'accounts receivable') return 'asset'
  if (lower.includes('liability') || lower === 'credit card' || lower === 'accounts payable') return 'liability'
  if (lower === 'equity') return 'equity'
  if (lower.includes('income') || lower.includes('revenue')) return 'income'
  return 'expense'
}

export interface AccountPreview {
  name: string
  type: AccountType
  code: string
  description: string | null
  active: boolean
}

export async function previewAccountImport(
  designerId: string,
): Promise<ImportProposalRow<AccountPreview>[]> {
  const sb = supabaseAdmin()
  const [qbRes, hjRes, refsRes] = await Promise.all([
    qboFetch(designerId, 'query', {
      query: { query: 'SELECT * FROM Account MAXRESULTS 1000' },
    }) as Promise<{ QueryResponse?: { Account?: RawQboAccount[] } }>,
    sb.from('accounts').select('*').eq('designer_id', designerId),
    sb
      .from('qbo_external_refs')
      .select('hejmae_id, qbo_id')
      .eq('designer_id', designerId)
      .eq('entity_type', 'account'),
  ])
  if (hjRes.error) throw hjRes.error
  if (refsRes.error) throw refsRes.error

  const qbAccounts = qbRes.QueryResponse?.Account ?? []
  const hjAccounts = (hjRes.data ?? []) as AccountRow[]
  const existingRefs = new Map<string, string>() // qbo_id → hejmae_id
  for (const r of refsRes.data ?? []) {
    existingRefs.set(
      (r as { qbo_id: string }).qbo_id,
      (r as { hejmae_id: string }).hejmae_id,
    )
  }

  const hjByName = new Map<string, AccountRow>()
  for (const a of hjAccounts) hjByName.set(a.name.toLowerCase(), a)
  const usedCodes = new Set(hjAccounts.map((a) => a.code))

  // Pre-compute candidate codes from QBO's AcctNum, falling back to a type-prefixed sequence.
  const typePrefix: Record<AccountType, string> = {
    asset: '1',
    liability: '2',
    equity: '3',
    income: '4',
    expense: '5',
  }
  const nextSeqByType: Record<AccountType, number> = {
    asset: 9000,
    liability: 9000,
    equity: 9000,
    income: 9000,
    expense: 9000,
  }

  function pickCode(type: AccountType, acctNum: string | undefined): string {
    if (acctNum && !usedCodes.has(acctNum)) {
      usedCodes.add(acctNum)
      return acctNum
    }
    // Otherwise generate from the type prefix.
    while (true) {
      const code = `${typePrefix[type]}${nextSeqByType[type]++}`
      if (!usedCodes.has(code)) {
        usedCodes.add(code)
        return code
      }
    }
  }

  const rows: ImportProposalRow<AccountPreview>[] = []
  for (const q of qbAccounts) {
    const type = qboClassificationToType(q.Classification, q.AccountType)
    const existingRefHejmaeId = existingRefs.get(q.Id)
    if (existingRefHejmaeId) {
      rows.push({
        qboId: q.Id,
        qboName: q.FullyQualifiedName,
        action: 'mapped',
        existingHejmaeId: existingRefHejmaeId,
        preview: {
          name: q.Name,
          type,
          code: q.AcctNum ?? '',
          description: q.Description ?? null,
          active: q.Active,
        },
      })
      continue
    }
    const nameMatch = hjByName.get(q.Name.toLowerCase())
    if (nameMatch) {
      rows.push({
        qboId: q.Id,
        qboName: q.FullyQualifiedName,
        action: 'merge',
        existingHejmaeId: nameMatch.id,
        preview: {
          name: nameMatch.name,
          type: nameMatch.type,
          code: nameMatch.code,
          description: nameMatch.description,
          active: nameMatch.is_active,
        },
      })
      continue
    }
    rows.push({
      qboId: q.Id,
      qboName: q.FullyQualifiedName,
      action: 'create',
      preview: {
        name: q.Name,
        type,
        code: pickCode(type, q.AcctNum),
        description: q.Description ?? null,
        active: q.Active,
      },
    })
  }
  return rows
}

export interface AccountImportResult {
  created: number
  merged: number
  alreadyMapped: number
  errors: Array<{ qboId: string; message: string }>
}

export async function applyAccountImport(
  designerId: string,
): Promise<AccountImportResult> {
  const proposals = await previewAccountImport(designerId)
  const sb = supabaseAdmin()
  const result: AccountImportResult = {
    created: 0,
    merged: 0,
    alreadyMapped: 0,
    errors: [],
  }
  for (const p of proposals) {
    try {
      if (p.action === 'mapped') {
        result.alreadyMapped++
        continue
      }
      if (p.action === 'merge') {
        if (!p.existingHejmaeId) continue
        await upsertRef({
          designerId,
          entityType: 'account',
          hejmaeId: p.existingHejmaeId,
          qboId: p.qboId,
        })
        result.merged++
        continue
      }
      // create
      const { data: inserted, error: insErr } = await sb
        .from('accounts')
        .insert({
          designer_id: designerId,
          code: p.preview.code,
          name: p.preview.name,
          type: p.preview.type,
          description: p.preview.description,
          is_active: p.preview.active,
          is_system: false,
        })
        .select('id')
        .single()
      if (insErr) throw insErr
      await upsertRef({
        designerId,
        entityType: 'account',
        hejmaeId: inserted.id,
        qboId: p.qboId,
      })
      result.created++
    } catch (e) {
      result.errors.push({
        qboId: p.qboId,
        message: (e as Error).message,
      })
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Customers → clients
// ---------------------------------------------------------------------------

interface RawQboCustomer {
  Id: string
  DisplayName: string
  PrimaryEmailAddr?: { Address?: string }
  PrimaryPhone?: { FreeFormNumber?: string }
  Notes?: string
  Active: boolean
}

export interface CustomerPreview {
  name: string
  email: string | null
  phone: string | null
  notes: string | null
}

export async function previewCustomerImport(
  designerId: string,
): Promise<ImportProposalRow<CustomerPreview>[]> {
  const sb = supabaseAdmin()
  const [qbRes, hjRes, refsRes] = await Promise.all([
    qboFetch(designerId, 'query', {
      query: { query: "SELECT * FROM Customer WHERE Active = true MAXRESULTS 1000" },
    }) as Promise<{ QueryResponse?: { Customer?: RawQboCustomer[] } }>,
    sb.from('clients').select('*').eq('designer_id', designerId),
    sb
      .from('qbo_external_refs')
      .select('hejmae_id, qbo_id')
      .eq('designer_id', designerId)
      .eq('entity_type', 'customer'),
  ])
  if (hjRes.error) throw hjRes.error
  if (refsRes.error) throw refsRes.error

  const qbRows = qbRes.QueryResponse?.Customer ?? []
  const hjRows = (hjRes.data ?? []) as ClientRow[]
  const existingRefs = new Map<string, string>()
  for (const r of refsRes.data ?? []) {
    existingRefs.set(
      (r as { qbo_id: string }).qbo_id,
      (r as { hejmae_id: string }).hejmae_id,
    )
  }
  const byName = new Map<string, ClientRow>()
  for (const c of hjRows) byName.set(c.name.toLowerCase(), c)

  return qbRows.map((q) => {
    const mappedHej = existingRefs.get(q.Id)
    if (mappedHej) {
      return {
        qboId: q.Id,
        qboName: q.DisplayName,
        action: 'mapped' as const,
        existingHejmaeId: mappedHej,
        preview: {
          name: q.DisplayName,
          email: q.PrimaryEmailAddr?.Address ?? null,
          phone: q.PrimaryPhone?.FreeFormNumber ?? null,
          notes: q.Notes ?? null,
        },
      }
    }
    const match = byName.get(q.DisplayName.toLowerCase())
    if (match) {
      return {
        qboId: q.Id,
        qboName: q.DisplayName,
        action: 'merge' as const,
        existingHejmaeId: match.id,
        preview: {
          name: match.name,
          email: match.email,
          phone: match.phone,
          notes: match.notes,
        },
      }
    }
    return {
      qboId: q.Id,
      qboName: q.DisplayName,
      action: 'create' as const,
      preview: {
        name: q.DisplayName,
        email: q.PrimaryEmailAddr?.Address ?? null,
        phone: q.PrimaryPhone?.FreeFormNumber ?? null,
        notes: q.Notes ?? null,
      },
    }
  })
}

export interface CustomerImportResult {
  created: number
  merged: number
  alreadyMapped: number
  errors: Array<{ qboId: string; message: string }>
}

export async function applyCustomerImport(
  designerId: string,
): Promise<CustomerImportResult> {
  const proposals = await previewCustomerImport(designerId)
  const sb = supabaseAdmin()
  const result: CustomerImportResult = {
    created: 0,
    merged: 0,
    alreadyMapped: 0,
    errors: [],
  }
  for (const p of proposals) {
    try {
      if (p.action === 'mapped') {
        result.alreadyMapped++
        continue
      }
      if (p.action === 'merge' && p.existingHejmaeId) {
        // Fill in blank fields only — never overwrite user-edited values.
        const { data: current, error: loadErr } = await sb
          .from('clients')
          .select('*')
          .eq('id', p.existingHejmaeId)
          .single()
        if (loadErr) throw loadErr
        const c = current as ClientRow
        const patch: Record<string, unknown> = {}
        if (!c.email && p.preview.email) patch.email = p.preview.email
        if (!c.phone && p.preview.phone) patch.phone = p.preview.phone
        if (!c.notes && p.preview.notes) patch.notes = p.preview.notes
        if (Object.keys(patch).length > 0) {
          const { error: upErr } = await sb
            .from('clients')
            .update(patch)
            .eq('id', p.existingHejmaeId)
            .eq('designer_id', designerId)
          if (upErr) throw upErr
        }
        await upsertRef({
          designerId,
          entityType: 'customer',
          hejmaeId: p.existingHejmaeId,
          qboId: p.qboId,
        })
        result.merged++
        continue
      }
      // create
      const { data: inserted, error: insErr } = await sb
        .from('clients')
        .insert({
          designer_id: designerId,
          name: p.preview.name,
          email: p.preview.email,
          phone: p.preview.phone,
          notes: p.preview.notes,
        })
        .select('id')
        .single()
      if (insErr) throw insErr
      await upsertRef({
        designerId,
        entityType: 'customer',
        hejmaeId: inserted.id,
        qboId: p.qboId,
      })
      result.created++
    } catch (e) {
      result.errors.push({ qboId: p.qboId, message: (e as Error).message })
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------

interface RawQboVendor {
  Id: string
  DisplayName: string
  CompanyName?: string
  PrimaryEmailAddr?: { Address?: string }
  PrimaryPhone?: { FreeFormNumber?: string }
  WebAddr?: { URI?: string }
  Vendor1099?: boolean
  TaxIdentifier?: string
  BillAddr?: {
    Line1?: string
    Line2?: string
    City?: string
    CountrySubDivisionCode?: string
    PostalCode?: string
    Country?: string
  }
  Notes?: string
  Active: boolean
}

export interface VendorPreview {
  name: string
  legal_name: string | null
  contact_email: string | null
  contact_phone: string | null
  website: string | null
  is_1099_eligible: boolean
  tax_id_last4: string | null
  address_line1: string | null
  address_line2: string | null
  address_city: string | null
  address_state: string | null
  address_postal_code: string | null
  address_country: string | null
  notes: string | null
}

function tail4(s: string | undefined): string | null {
  if (!s) return null
  const digits = s.replace(/[^0-9]/g, '')
  return digits.length >= 4 ? digits.slice(-4) : null
}

export async function previewVendorImport(
  designerId: string,
): Promise<ImportProposalRow<VendorPreview>[]> {
  const sb = supabaseAdmin()
  const [qbRes, hjRes, refsRes] = await Promise.all([
    qboFetch(designerId, 'query', {
      query: { query: "SELECT * FROM Vendor WHERE Active = true MAXRESULTS 1000" },
    }) as Promise<{ QueryResponse?: { Vendor?: RawQboVendor[] } }>,
    sb.from('vendors').select('*').eq('designer_id', designerId),
    sb
      .from('qbo_external_refs')
      .select('hejmae_id, qbo_id')
      .eq('designer_id', designerId)
      .eq('entity_type', 'vendor'),
  ])
  if (hjRes.error) throw hjRes.error
  if (refsRes.error) throw refsRes.error

  const qbRows = qbRes.QueryResponse?.Vendor ?? []
  const hjRows = (hjRes.data ?? []) as VendorRow[]
  const existingRefs = new Map<string, string>()
  for (const r of refsRes.data ?? []) {
    existingRefs.set(
      (r as { qbo_id: string }).qbo_id,
      (r as { hejmae_id: string }).hejmae_id,
    )
  }
  const byName = new Map<string, VendorRow>()
  for (const v of hjRows) byName.set(v.name.toLowerCase(), v)

  return qbRows.map((q) => {
    const pv: VendorPreview = {
      name: q.DisplayName,
      legal_name: q.CompanyName ?? null,
      contact_email: q.PrimaryEmailAddr?.Address ?? null,
      contact_phone: q.PrimaryPhone?.FreeFormNumber ?? null,
      website: q.WebAddr?.URI ?? null,
      is_1099_eligible: !!q.Vendor1099,
      tax_id_last4: tail4(q.TaxIdentifier),
      address_line1: q.BillAddr?.Line1 ?? null,
      address_line2: q.BillAddr?.Line2 ?? null,
      address_city: q.BillAddr?.City ?? null,
      address_state: q.BillAddr?.CountrySubDivisionCode ?? null,
      address_postal_code: q.BillAddr?.PostalCode ?? null,
      address_country: q.BillAddr?.Country ?? null,
      notes: q.Notes ?? null,
    }
    const mappedHej = existingRefs.get(q.Id)
    if (mappedHej) {
      return {
        qboId: q.Id,
        qboName: q.DisplayName,
        action: 'mapped' as const,
        existingHejmaeId: mappedHej,
        preview: pv,
      }
    }
    const match = byName.get(q.DisplayName.toLowerCase())
    if (match) {
      return {
        qboId: q.Id,
        qboName: q.DisplayName,
        action: 'merge' as const,
        existingHejmaeId: match.id,
        preview: pv,
      }
    }
    return { qboId: q.Id, qboName: q.DisplayName, action: 'create' as const, preview: pv }
  })
}

export interface VendorImportResult {
  created: number
  merged: number
  alreadyMapped: number
  errors: Array<{ qboId: string; message: string }>
}

export async function applyVendorImport(
  designerId: string,
): Promise<VendorImportResult> {
  const proposals = await previewVendorImport(designerId)
  const sb = supabaseAdmin()
  const result: VendorImportResult = {
    created: 0,
    merged: 0,
    alreadyMapped: 0,
    errors: [],
  }
  for (const p of proposals) {
    try {
      if (p.action === 'mapped') {
        result.alreadyMapped++
        continue
      }
      if (p.action === 'merge' && p.existingHejmaeId) {
        const { data: current, error: loadErr } = await sb
          .from('vendors')
          .select('*')
          .eq('id', p.existingHejmaeId)
          .single()
        if (loadErr) throw loadErr
        const v = current as VendorRow
        const patch: Record<string, unknown> = {}
        const fill = <K extends keyof VendorRow>(
          field: K,
          incoming: VendorRow[K] | null,
        ) => {
          if (
            (v[field] === null || v[field] === undefined || v[field] === '') &&
            incoming !== null &&
            incoming !== undefined &&
            incoming !== ''
          ) {
            patch[field as string] = incoming
          }
        }
        fill('legal_name', p.preview.legal_name)
        fill('contact_email', p.preview.contact_email)
        fill('contact_phone', p.preview.contact_phone)
        fill('website', p.preview.website)
        fill('tax_id_last4', p.preview.tax_id_last4)
        fill('address_line1', p.preview.address_line1)
        fill('address_line2', p.preview.address_line2)
        fill('address_city', p.preview.address_city)
        fill('address_state', p.preview.address_state)
        fill('address_postal_code', p.preview.address_postal_code)
        fill('address_country', p.preview.address_country)
        fill('notes', p.preview.notes)
        if (!v.is_1099_eligible && p.preview.is_1099_eligible) {
          patch.is_1099_eligible = true
        }
        if (Object.keys(patch).length > 0) {
          const { error: upErr } = await sb
            .from('vendors')
            .update(patch)
            .eq('id', p.existingHejmaeId)
            .eq('designer_id', designerId)
          if (upErr) throw upErr
        }
        await upsertRef({
          designerId,
          entityType: 'vendor',
          hejmaeId: p.existingHejmaeId,
          qboId: p.qboId,
        })
        result.merged++
        continue
      }
      // create
      const { data: inserted, error: insErr } = await sb
        .from('vendors')
        .insert({ designer_id: designerId, ...p.preview })
        .select('id')
        .single()
      if (insErr) throw insErr
      await upsertRef({
        designerId,
        entityType: 'vendor',
        hejmaeId: inserted.id,
        qboId: p.qboId,
      })
      result.created++
    } catch (e) {
      result.errors.push({ qboId: p.qboId, message: (e as Error).message })
    }
  }
  return result
}
