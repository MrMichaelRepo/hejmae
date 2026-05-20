// Tiny CSV builder shared across the report exports.
//
// We defang Excel-style formula injection at the cell level: any value
// whose first character would cause Excel / Google Sheets / LibreOffice
// to evaluate it (=, +, -, @, plus tab/CR which can be exploited via
// auto-trim) is prefixed with a single quote. This matters now that we
// store user-controlled bank statement descriptions and route them into
// the expense exports.

function defang(s: string): string {
  if (s.length === 0) return s
  const first = s[0]
  if (first !== '=' && first !== '+' && first !== '-' && first !== '@' && first !== '\t' && first !== '\r') {
    return s
  }
  // Exempt plain numbers (incl. negatives like "-123.45"). Anything else
  // starting with a dangerous lead char gets a leading apostrophe so Excel
  // treats it as text. The apostrophe is invisible in Excel's display but
  // visible in a true CSV viewer — acceptable trade-off.
  if (/^-?\d+(\.\d+)?$/.test(s)) return s
  return "'" + s
}

export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = defang(typeof v === 'number' ? String(v) : String(v))
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(',')
}

export function csvBody(rows: string[]): string {
  return rows.join('\n') + '\n'
}

// Format cents as a USD decimal string ("12345" → "123.45"). CSV exports
// usually want decimal money, not cents.
export function dollars(cents: number | null | undefined): string {
  if (cents == null) return ''
  return (cents / 100).toFixed(2)
}

import { NextResponse } from 'next/server'

export function csvResponse(filename: string, body: string): NextResponse {
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
