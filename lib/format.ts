// Display formatters. All money is in cents.

export function formatCents(cents: number | null | undefined, fallback = '—'): string {
  if (cents == null) return fallback
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

export function formatPercent(pct: number | null | undefined, fallback = '—'): string {
  if (pct == null || isNaN(pct)) return fallback
  return `${pct.toFixed(1)}%`
}

export function formatDate(iso: string | null | undefined, fallback = '—'): string {
  if (!iso) return fallback
  const d = new Date(iso)
  if (isNaN(d.getTime())) return fallback
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateTime(iso: string | null | undefined, fallback = '—'): string {
  if (!iso) return fallback
  const d = new Date(iso)
  if (isNaN(d.getTime())) return fallback
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`
  return formatDate(iso)
}

export function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// User-typed dollar string → integer cents. Returns null on bad input.
export function dollarsToCents(s: string): number | null {
  const cleaned = s.replace(/[$,\s]/g, '').trim()
  if (!cleaned) return null
  const n = Number(cleaned)
  if (isNaN(n)) return null
  return Math.round(n * 100)
}

export function centsToDollars(cents: number | null | undefined): string {
  if (cents == null) return ''
  return (cents / 100).toFixed(2)
}
