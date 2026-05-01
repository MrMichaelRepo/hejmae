// Client-price calculation. Single source of truth — every code path that
// writes Item.client_price_cents must go through this.

import type { PricingMode } from '@/lib/supabase/types'

export interface PricingContext {
  pricingMode: PricingMode
  markupPercent: number
}

export interface PricingInput {
  tradePriceCents: number
  retailPriceCents: number | null
}

export interface PricingResult {
  clientPriceCents: number
  fallbackToCostPlus: boolean
}

export function calculateClientPriceCents(
  ctx: PricingContext,
  input: PricingInput,
): PricingResult {
  if (ctx.pricingMode === 'retail') {
    if (input.retailPriceCents != null) {
      return { clientPriceCents: input.retailPriceCents, fallbackToCostPlus: false }
    }
    // Retail mode but we have no retail price — fall back to cost-plus and
    // let the caller flag the item.
    return {
      clientPriceCents: applyMarkup(input.tradePriceCents, ctx.markupPercent),
      fallbackToCostPlus: true,
    }
  }
  return {
    clientPriceCents: applyMarkup(input.tradePriceCents, ctx.markupPercent),
    fallbackToCostPlus: false,
  }
}

function applyMarkup(tradeCents: number, markupPct: number): number {
  // Round half-up to nearest cent, never producing a negative number.
  const raw = tradeCents * (1 + markupPct / 100)
  return Math.max(0, Math.round(raw))
}
