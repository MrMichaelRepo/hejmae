// Balance sheet "as of" a chosen date.
//
// Sums journal_lines per account up through the date and groups by account
// type. By accounting identity, total assets = liabilities + equity + (Net
// income for the period, which here is open earnings rolled into equity).
//
// We compute Net Income as (income - expenses) over all time through the
// "as of" date, since hejmae doesn't yet have a year-end close that posts
// the closing JE. The BS shows it on a separate "Retained earnings (open)"
// row so the user can see what would close into equity.
//
// Cash basis vs accrual: the journal already reflects the basis — invoices
// post AR on accrual, payments post cash on either basis. We don't filter
// here; the basis affects what gets posted upstream.

import { supabaseAdmin } from '@/lib/supabase/server'
import type { AccountRow, AccountType } from '@/lib/supabase/types'

export interface BalanceSheetLine {
  account_id: string
  code: string
  name: string
  balance_cents: number
}

export interface BalanceSheetGroup {
  type: AccountType
  total_cents: number
  lines: BalanceSheetLine[]
}

export interface BalanceSheet {
  asOf: string
  assets: BalanceSheetGroup
  liabilities: BalanceSheetGroup
  equity: BalanceSheetGroup
  // Open earnings (income - expenses) — the closing-JE candidate.
  openEarningsCents: number
  // Sums for the user.
  totalAssetsCents: number
  totalLiabilitiesAndEquityCents: number
  // Should be true on a healthy book.
  balanced: boolean
}

// Returns: positive balance = the natural side for that account type.
// Hejmae stores signed amounts (positive=debit, negative=credit). Normal
// balance for each type:
//   asset, expense → debit-positive (use raw sum)
//   liability, equity, income → credit-positive (negate the sum)
function naturalBalance(type: AccountType, debitMinusCredit: number): number {
  if (type === 'asset' || type === 'expense') return debitMinusCredit
  return -debitMinusCredit
}

export async function buildBalanceSheet(
  designerId: string,
  asOf: string,
): Promise<BalanceSheet> {
  const sb = supabaseAdmin()
  const [acctsRes, linesRes] = await Promise.all([
    sb
      .from('accounts')
      .select('*')
      .eq('designer_id', designerId)
      .eq('is_active', true)
      .order('code', { ascending: true }),
    sb
      .from('journal_lines')
      .select('account_id, amount_cents, entry_id, journal_entries!inner(entry_date, designer_id)')
      .eq('designer_id', designerId)
      .lte('journal_entries.entry_date', asOf),
  ])
  if (acctsRes.error) throw acctsRes.error
  if (linesRes.error) throw linesRes.error

  const accounts = (acctsRes.data ?? []) as AccountRow[]
  const balByAcct = new Map<string, number>()
  for (const l of linesRes.data ?? []) {
    const row = l as { account_id: string; amount_cents: number }
    balByAcct.set(row.account_id, (balByAcct.get(row.account_id) ?? 0) + row.amount_cents)
  }

  function group(type: AccountType): BalanceSheetGroup {
    const lines: BalanceSheetLine[] = []
    let total = 0
    for (const a of accounts) {
      if (a.type !== type) continue
      const raw = balByAcct.get(a.id) ?? 0
      const bal = naturalBalance(type, raw)
      if (bal === 0) continue
      lines.push({ account_id: a.id, code: a.code, name: a.name, balance_cents: bal })
      total += bal
    }
    return { type, total_cents: total, lines }
  }

  const assets = group('asset')
  const liabilities = group('liability')
  const equity = group('equity')
  const incomeGroup = group('income')
  const expenseGroup = group('expense')
  // Net income through asOf (revenue – expenses). Income's natural balance
  // is credit-positive; expense's is debit-positive. Subtract.
  const openEarnings = incomeGroup.total_cents - expenseGroup.total_cents

  const totalAssets = assets.total_cents
  const totalLiabEqOpenEarn =
    liabilities.total_cents + equity.total_cents + openEarnings

  return {
    asOf,
    assets,
    liabilities,
    equity,
    openEarningsCents: openEarnings,
    totalAssetsCents: totalAssets,
    totalLiabilitiesAndEquityCents: totalLiabEqOpenEarn,
    balanced: Math.abs(totalAssets - totalLiabEqOpenEarn) <= 1,
  }
}
