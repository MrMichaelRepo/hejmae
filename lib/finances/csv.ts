// Tiny CSV builder shared across the report exports.

export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
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
