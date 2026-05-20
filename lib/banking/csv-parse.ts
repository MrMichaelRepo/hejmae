// Multi-format bank-statement CSV parser.
//
// Recognises Chase (personal + business), Bank of America (personal + biz),
// Amex (statement download), and a "generic" 3-column fallback. The parser
// returns canonicalized rows: { txn_date, description, amount_cents,
// balance_cents | null }. Negative amount = outflow.
//
// We parse only what's reliable. Bank exports vary by account product, by
// download path (statement vs activity), and by year. When the format
// drifts, the generic fallback usually still gets the data through — it
// looks for any column header containing 'date' / 'description' /
// 'amount' (or 'debit'+'credit') and ignores the rest.

import type { BankImportSource } from '@/lib/supabase/types'

export interface ParsedBankRow {
  txn_date: string // ISO 'YYYY-MM-DD'
  description: string
  amount_cents: number
  balance_cents: number | null
}

export interface ParsedStatement {
  rows: ParsedBankRow[]
  periodStart: string | null
  periodEnd: string | null
  source: BankImportSource
  warnings: string[]
}

// ---------------------------------------------------------------------------
// CSV tokenizer (RFC 4180-ish — quoted fields, escaped quotes, CRLF safe).
// ---------------------------------------------------------------------------

export function tokenizeCsv(text: string): string[][] {
  const out: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  // Strip BOM.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)

  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (ch === '\n' || ch === '\r') {
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') out.push(row)
      row = []
      if (ch === '\r' && text[i + 1] === '\n') i++
      i++
      continue
    }
    field += ch
    i++
  }
  if (field || row.length > 0) {
    row.push(field)
    if (row.length > 1 || row[0] !== '') out.push(row)
  }
  return out
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseAmount(raw: string): number | null {
  if (!raw) return null
  let s = raw.trim()
  if (!s) return null
  // Parentheses = negative (common in accounting exports).
  let negative = false
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true
    s = s.slice(1, -1)
  }
  // Strip currency symbol, thousands separators, spaces.
  s = s.replace(/[$,\s]/g, '')
  if (s.startsWith('-')) {
    negative = !negative
    s = s.slice(1)
  }
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  const cents = Math.round(n * 100)
  return negative ? -cents : cents
}

// Parse "MM/DD/YYYY", "M/D/YY", "YYYY-MM-DD", "Mon DD, YYYY".
function parseDate(raw: string): string | null {
  if (!raw) return null
  const s = raw.trim()
  // ISO first.
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  // US slash.
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s)
  if (us) {
    let yr = us[3]
    if (yr.length === 2) yr = (Number(yr) < 70 ? '20' : '19') + yr
    const mm = us[1].padStart(2, '0')
    const dd = us[2].padStart(2, '0')
    return `${yr}-${mm}-${dd}`
  }
  // Fallback: Date.parse.
  const t = Date.parse(s)
  if (!Number.isFinite(t)) return null
  const d = new Date(t)
  const yr = d.getUTCFullYear().toString().padStart(4, '0')
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0')
  const dd = d.getUTCDate().toString().padStart(2, '0')
  return `${yr}-${mm}-${dd}`
}

function lc(s: string | undefined): string {
  return (s ?? '').toLowerCase().trim()
}

function indexOfMatching(
  headers: string[],
  predicates: Array<(h: string) => boolean>,
): number {
  for (let i = 0; i < headers.length; i++) {
    const h = lc(headers[i])
    if (predicates.some((p) => p(h))) return i
  }
  return -1
}

// ---------------------------------------------------------------------------
// Source detection from headers
// ---------------------------------------------------------------------------

export function detectSource(headers: string[]): BankImportSource {
  const joined = headers.map(lc).join('|')
  // Chase: "Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #"
  // or simpler activity: "Posting Date,Description,Amount,Type,Balance"
  if (joined.includes('posting date') && joined.includes('balance')) return 'chase'
  // BoA: "Date,Description,Amount,Running Bal."
  if (joined.includes('running bal')) return 'bofa'
  // Amex: "Date,Description,Amount" with cards typically having "Card Member"
  if (joined.includes('card member') || (joined.includes('date') && joined.includes('amount') && joined.includes('extended details'))) return 'amex'
  return 'generic'
}

// ---------------------------------------------------------------------------
// Per-source row mappers
// ---------------------------------------------------------------------------

function parseChase(rows: string[][]): ParsedBankRow[] {
  const headers = rows[0]
  const dateIdx = indexOfMatching(headers, [(h) => h === 'posting date' || h === 'transaction date'])
  const descIdx = indexOfMatching(headers, [(h) => h === 'description'])
  const amtIdx = indexOfMatching(headers, [(h) => h === 'amount'])
  const balIdx = indexOfMatching(headers, [(h) => h === 'balance'])
  const out: ParsedBankRow[] = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const d = parseDate(r[dateIdx])
    const amt = parseAmount(r[amtIdx])
    if (!d || amt === null) continue
    out.push({
      txn_date: d,
      description: r[descIdx]?.trim() ?? '',
      amount_cents: amt,
      balance_cents: balIdx >= 0 ? parseAmount(r[balIdx]) : null,
    })
  }
  return out
}

function parseBofa(rows: string[][]): ParsedBankRow[] {
  // BoA exports often have a preamble. Find the header row that contains
  // 'date' and 'description'.
  let headerIdx = -1
  for (let i = 0; i < rows.length; i++) {
    const j = rows[i].map(lc).join('|')
    if (j.includes('date') && j.includes('description') && j.includes('amount')) {
      headerIdx = i
      break
    }
  }
  if (headerIdx < 0) return []
  const headers = rows[headerIdx]
  const dateIdx = indexOfMatching(headers, [(h) => h === 'date' || h === 'posting date'])
  const descIdx = indexOfMatching(headers, [(h) => h === 'description'])
  const amtIdx = indexOfMatching(headers, [(h) => h === 'amount'])
  const balIdx = indexOfMatching(headers, [(h) => h.includes('running')])
  const out: ParsedBankRow[] = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]
    const d = parseDate(r[dateIdx])
    const amt = parseAmount(r[amtIdx])
    if (!d || amt === null) continue
    // BoA exports the "Beginning balance" as a separate row with empty
    // description — skip it.
    if ((r[descIdx] ?? '').toLowerCase().includes('beginning balance')) continue
    out.push({
      txn_date: d,
      description: r[descIdx]?.trim() ?? '',
      amount_cents: amt,
      balance_cents: balIdx >= 0 ? parseAmount(r[balIdx]) : null,
    })
  }
  return out
}

function parseAmex(rows: string[][]): ParsedBankRow[] {
  const headers = rows[0]
  const dateIdx = indexOfMatching(headers, [(h) => h === 'date'])
  const descIdx = indexOfMatching(headers, [
    (h) => h === 'description',
    (h) => h.includes('extended details'),
  ])
  const amtIdx = indexOfMatching(headers, [(h) => h === 'amount'])
  const out: ParsedBankRow[] = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const d = parseDate(r[dateIdx])
    const amt = parseAmount(r[amtIdx])
    if (!d || amt === null) continue
    // Amex semantics: positive = charge (outflow), negative = payment/credit.
    // Normalize to hejmae's convention: negative = outflow.
    out.push({
      txn_date: d,
      description: r[descIdx]?.trim() ?? '',
      amount_cents: -amt,
      balance_cents: null,
    })
  }
  return out
}

function parseGeneric(rows: string[][]): ParsedBankRow[] {
  const headers = rows[0]
  const dateIdx = indexOfMatching(headers, [(h) => h.includes('date')])
  const descIdx = indexOfMatching(headers, [
    (h) => h.includes('description') || h.includes('memo') || h.includes('details') || h.includes('payee'),
  ])
  const amtIdx = indexOfMatching(headers, [(h) => h === 'amount' || h.includes('amount')])
  const debitIdx = indexOfMatching(headers, [(h) => h === 'debit' || h.includes('withdrawal')])
  const creditIdx = indexOfMatching(headers, [(h) => h === 'credit' || h.includes('deposit')])
  const balIdx = indexOfMatching(headers, [(h) => h.includes('balance')])
  const out: ParsedBankRow[] = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const d = parseDate(r[dateIdx])
    if (!d) continue
    let amt: number | null = null
    if (amtIdx >= 0) amt = parseAmount(r[amtIdx])
    else if (debitIdx >= 0 || creditIdx >= 0) {
      const debit = debitIdx >= 0 ? parseAmount(r[debitIdx]) ?? 0 : 0
      const credit = creditIdx >= 0 ? parseAmount(r[creditIdx]) ?? 0 : 0
      amt = credit - debit
    }
    if (amt === null) continue
    out.push({
      txn_date: d,
      description: r[descIdx]?.trim() ?? '',
      amount_cents: amt,
      balance_cents: balIdx >= 0 ? parseAmount(r[balIdx]) : null,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function parseBankCsv(
  text: string,
  hint?: BankImportSource,
): ParsedStatement {
  const tokens = tokenizeCsv(text)
  if (tokens.length === 0) {
    return {
      rows: [],
      periodStart: null,
      periodEnd: null,
      source: hint ?? 'generic',
      warnings: ['Empty file'],
    }
  }
  const headers = tokens[0]
  const source = hint ?? detectSource(headers)
  let rows: ParsedBankRow[] = []
  let warnings: string[] = []

  try {
    if (source === 'chase') rows = parseChase(tokens)
    else if (source === 'bofa') rows = parseBofa(tokens)
    else if (source === 'amex') rows = parseAmex(tokens)
    else rows = parseGeneric(tokens)
  } catch (e) {
    warnings.push(`Parser failed: ${(e as Error).message}`)
  }

  if (rows.length === 0 && source !== 'generic') {
    // Retry with generic — covers the common case where the user
    // mis-labelled the bank.
    try {
      rows = parseGeneric(tokens)
      warnings.push('Falling back to generic parser')
    } catch {
      // ignore
    }
  }

  rows.sort((a, b) => a.txn_date.localeCompare(b.txn_date))
  const periodStart = rows.length > 0 ? rows[0].txn_date : null
  const periodEnd = rows.length > 0 ? rows[rows.length - 1].txn_date : null

  return { rows, periodStart, periodEnd, source, warnings }
}
