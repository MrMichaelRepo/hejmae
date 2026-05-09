// Period filters for finance reports. Centralized so every report page
// parses the same query-string shape and computes the same date range.
//
// Query string contract:
//   ?period=ytd | mtd | qtd | last_year | this_quarter | this_month |
//          this_year | last_month | last_quarter | custom
//   ?from=YYYY-MM-DD&to=YYYY-MM-DD   (only when period=custom)
//   ?basis=cash | accrual            (overrides the studio default)
//   ?fy_start=1..12                  (fiscal year start month, optional)
//
// All dates are interpreted in UTC. The date math is intentionally calendar-
// based, not timezone-aware — finance periods are calendar concepts, and
// the studio either picks a basis day or doesn't.

import type { AccountingBasis } from '@/lib/supabase/types'

export type PeriodKey =
  | 'ytd'
  | 'mtd'
  | 'qtd'
  | 'this_year'
  | 'this_quarter'
  | 'this_month'
  | 'last_year'
  | 'last_quarter'
  | 'last_month'
  | 'all_time'
  | 'custom'

export interface ResolvedPeriod {
  key: PeriodKey
  // ISO date strings, inclusive on both ends. `from` may be null for
  // 'all_time'.
  from: string | null
  to: string
  // Human label for UI, e.g. "YTD 2026" or "Apr 1 – Jun 30, 2026".
  label: string
  // The fiscal year start month used (1..12). Calendar = 1.
  fiscal_year_start_month: number
}

const ISO = (d: Date) => d.toISOString().slice(0, 10)

function startOfMonth(year: number, month0: number): Date {
  return new Date(Date.UTC(year, month0, 1))
}
function endOfMonth(year: number, month0: number): Date {
  return new Date(Date.UTC(year, month0 + 1, 0))
}
function startOfQuarter(year: number, qIndex0: number): Date {
  return new Date(Date.UTC(year, qIndex0 * 3, 1))
}
function endOfQuarter(year: number, qIndex0: number): Date {
  return new Date(Date.UTC(year, qIndex0 * 3 + 3, 0))
}

// Returns the (year, month0) pair representing the start of the *fiscal*
// year that `today` falls into.
function fiscalYearAnchor(today: Date, fyStartMonth: number): { year: number; month0: number } {
  const m = today.getUTCMonth()
  const y = today.getUTCFullYear()
  const startM0 = fyStartMonth - 1
  if (m >= startM0) return { year: y, month0: startM0 }
  return { year: y - 1, month0: startM0 }
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function fmtRange(from: Date, to: Date): string {
  const sameYear = from.getUTCFullYear() === to.getUTCFullYear()
  const a = `${MONTH_NAMES[from.getUTCMonth()]} ${from.getUTCDate()}`
  const b = `${MONTH_NAMES[to.getUTCMonth()]} ${to.getUTCDate()}, ${to.getUTCFullYear()}`
  return sameYear ? `${a} – ${b}` : `${a}, ${from.getUTCFullYear()} – ${b}`
}

export function resolvePeriod(opts: {
  searchParams: URLSearchParams | Record<string, string | string[] | undefined>
  fiscal_year_start_month?: number
  today?: Date
}): ResolvedPeriod {
  const fyStart = opts.fiscal_year_start_month ?? 1
  const today = opts.today ?? new Date()

  const get = (k: string): string | null => {
    if (opts.searchParams instanceof URLSearchParams) {
      return opts.searchParams.get(k)
    }
    const v = opts.searchParams[k]
    if (Array.isArray(v)) return v[0] ?? null
    return v ?? null
  }

  const requestedFy = get('fy_start')
  const fyStartMonth = requestedFy
    ? Math.min(12, Math.max(1, parseInt(requestedFy, 10) || fyStart))
    : fyStart

  const rawKey = (get('period') ?? 'ytd') as PeriodKey

  if (rawKey === 'custom') {
    const from = get('from')
    const to = get('to')
    const fromD = from && !Number.isNaN(Date.parse(from)) ? new Date(from + 'T00:00:00Z') : null
    const toD = to && !Number.isNaN(Date.parse(to)) ? new Date(to + 'T00:00:00Z') : today
    return {
      key: 'custom',
      from: fromD ? ISO(fromD) : null,
      to: ISO(toD),
      label: fromD ? fmtRange(fromD, toD) : `Through ${ISO(toD)}`,
      fiscal_year_start_month: fyStartMonth,
    }
  }

  if (rawKey === 'all_time') {
    return {
      key: 'all_time',
      from: null,
      to: ISO(today),
      label: 'All time',
      fiscal_year_start_month: fyStartMonth,
    }
  }

  const fy = fiscalYearAnchor(today, fyStartMonth)
  const fyStartDate = startOfMonth(fy.year, fy.month0)
  const fyEndDate = endOfMonth(fy.year + 1, fy.month0 - 1) // last day of fiscal year

  const ty = today.getUTCFullYear()
  const tm0 = today.getUTCMonth()
  const tq0 = Math.floor(tm0 / 3)

  let from: Date
  let to: Date
  let label: string

  switch (rawKey) {
    case 'mtd':
    case 'this_month': {
      from = startOfMonth(ty, tm0)
      to = today
      label = `${MONTH_NAMES[tm0]} ${ty} (MTD)`
      break
    }
    case 'last_month': {
      const m = tm0 === 0 ? 11 : tm0 - 1
      const y = tm0 === 0 ? ty - 1 : ty
      from = startOfMonth(y, m)
      to = endOfMonth(y, m)
      label = `${MONTH_NAMES[m]} ${y}`
      break
    }
    case 'qtd':
    case 'this_quarter': {
      from = startOfQuarter(ty, tq0)
      to = today
      label = `Q${tq0 + 1} ${ty} (QTD)`
      break
    }
    case 'last_quarter': {
      const lq = tq0 === 0 ? 3 : tq0 - 1
      const ly = tq0 === 0 ? ty - 1 : ty
      from = startOfQuarter(ly, lq)
      to = endOfQuarter(ly, lq)
      label = `Q${lq + 1} ${ly}`
      break
    }
    case 'this_year': {
      from = fyStartDate
      to = fyEndDate > today ? today : fyEndDate
      label = fyStartMonth === 1 ? `${ty} (YTD)` : `FY${fy.year + 1} (YTD)`
      break
    }
    case 'last_year': {
      const lyStart = startOfMonth(fy.year - 1, fy.month0)
      const lyEnd = endOfMonth(fy.year, fy.month0 - 1)
      from = lyStart
      to = lyEnd
      label = fyStartMonth === 1 ? `${fy.year - 1}` : `FY${fy.year}`
      break
    }
    case 'ytd':
    default: {
      from = fyStartDate
      to = today
      label = fyStartMonth === 1 ? `${ty} YTD` : `FY${fy.year + 1} YTD`
      break
    }
  }

  return {
    key: rawKey,
    from: ISO(from),
    to: ISO(to),
    label,
    fiscal_year_start_month: fyStartMonth,
  }
}

export function resolveBasis(
  searchParams: URLSearchParams | Record<string, string | string[] | undefined>,
  studioDefault: AccountingBasis,
): AccountingBasis {
  const get = (k: string): string | null => {
    if (searchParams instanceof URLSearchParams) return searchParams.get(k)
    const v = searchParams[k]
    if (Array.isArray(v)) return v[0] ?? null
    return v ?? null
  }
  const v = get('basis')
  if (v === 'cash' || v === 'accrual') return v
  return studioDefault
}

// AR aging buckets, computed from invoices that are unpaid as of `as_of`.
export interface AgingBuckets {
  current_cents: number      // 0–30 days outstanding
  bucket_31_60_cents: number
  bucket_61_90_cents: number
  bucket_over_90_cents: number
  total_cents: number
}

export function bucketAge(daysOutstanding: number): keyof Omit<AgingBuckets, 'total_cents'> {
  if (daysOutstanding <= 30) return 'current_cents'
  if (daysOutstanding <= 60) return 'bucket_31_60_cents'
  if (daysOutstanding <= 90) return 'bucket_61_90_cents'
  return 'bucket_over_90_cents'
}
