// Compute per-line tax + invoice tax total + grand total from a line set
// and a tax rate (in basis points). Everything is integer cents in / out.
//
// Rule: tax_cents per line = line.total_price_cents * rate_bps / 10000,
// rounded half-to-even (banker's rounding) to avoid the tiny systematic
// drift you get from always-round-half-up across many invoices. Non-
// taxable lines contribute 0.

export interface InvoiceLineForTax {
  unit_price_cents: number
  quantity: number
  taxable: boolean
}

export interface ComputedLineTotal {
  total_price_cents: number
  tax_cents: number
}

export interface ComputedInvoiceTotals {
  lines: ComputedLineTotal[]
  subtotal_cents: number
  tax_total_cents: number
  total_cents: number
}

function bankerRound(x: number): number {
  const f = Math.floor(x)
  const r = x - f
  if (r < 0.5) return f
  if (r > 0.5) return f + 1
  // Halfway: round to even.
  return f % 2 === 0 ? f : f + 1
}

export function computeInvoiceTotals(
  lines: InvoiceLineForTax[],
  rateBps: number,
): ComputedInvoiceTotals {
  const out: ComputedLineTotal[] = lines.map((l) => {
    const lineTotal = l.unit_price_cents * l.quantity
    const tax = l.taxable && rateBps > 0 ? bankerRound((lineTotal * rateBps) / 10_000) : 0
    return { total_price_cents: lineTotal, tax_cents: tax }
  })
  const subtotal = out.reduce((a, l) => a + l.total_price_cents, 0)
  const taxTotal = out.reduce((a, l) => a + l.tax_cents, 0)
  return {
    lines: out,
    subtotal_cents: subtotal,
    tax_total_cents: taxTotal,
    total_cents: subtotal + taxTotal,
  }
}
