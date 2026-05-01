// Client-portal sanitizers. Run BEFORE returning any row to a client-portal
// caller. Strips trade pricing from all shapes that might carry it.
//
// The rule is structural: we deny-list trade_* fields rather than allow-list
// safe fields, so adding a new trade_* column is automatically excluded
// without requiring portal code to be updated.

const TRADE_KEYS = new Set([
  'trade_price_cents',
  'total_trade_price_cents',
  'trade_price',
  'cogs_cents',
])

export function stripTrade<T>(row: T): T {
  if (!row || typeof row !== 'object') return row
  if (Array.isArray(row)) return row.map(stripTrade) as unknown as T
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
    if (TRADE_KEYS.has(k)) continue
    out[k] = typeof v === 'object' && v !== null ? stripTrade(v) : v
  }
  return out as T
}
