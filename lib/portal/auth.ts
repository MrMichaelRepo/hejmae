// Magic-link verification for the client portal.
//
// The portal does NOT use Clerk. Each route loads the row by token under a
// single, narrow query — and ONLY the columns we want to expose. RLS does
// not protect these queries (we use the service role) so all guarantees
// live in this file + lib/portal/sanitize.ts.
//
// To revoke access, set magic_link_revoked_at on the row. We refuse any
// token that has been revoked.

import { supabaseAdmin } from '@/lib/supabase/server'
import { notFound, badRequest, unauthorized } from '@/lib/errors'
import type {
  ProposalRow,
  ProposalRoomRow,
  InvoiceRow,
  InvoiceLineItemRow,
} from '@/lib/supabase/types'

function isValidTokenShape(t: string | null | undefined): t is string {
  // 32-byte base64url ≈ 43 chars. Reject anything implausible early.
  return !!t && /^[A-Za-z0-9_-]{20,128}$/.test(t)
}

export async function loadProposalByToken(token: string): Promise<{
  proposal: ProposalRow
  rooms: ProposalRoomRow[]
}> {
  if (!isValidTokenShape(token)) throw unauthorized('Invalid token')
  const sb = supabaseAdmin()
  const { data, error } = await sb
    .from('proposals')
    .select('*, proposal_rooms(*)')
    .eq('magic_link_token', token)
    .maybeSingle()
  if (error) throw error
  if (!data) throw notFound('Proposal not found')
  if (data.magic_link_revoked_at) throw unauthorized('Link revoked')
  if (data.status === 'draft') throw badRequest('Proposal not yet sent')
  const rooms = (data.proposal_rooms ?? []) as ProposalRoomRow[]
  // Don't return the raw join shape — flatten so callers don't accidentally
  // pass the proposal_rooms array around.
  const { proposal_rooms: _omit, ...proposal } = data as ProposalRow & {
    proposal_rooms: ProposalRoomRow[]
  }
  return { proposal: proposal as ProposalRow, rooms }
}

export async function loadInvoiceByToken(token: string): Promise<{
  invoice: InvoiceRow
  lines: InvoiceLineItemRow[]
}> {
  if (!isValidTokenShape(token)) throw unauthorized('Invalid token')
  const sb = supabaseAdmin()
  const { data, error } = await sb
    .from('invoices')
    .select('*, invoice_line_items(*)')
    .eq('magic_link_token', token)
    .maybeSingle()
  if (error) throw error
  if (!data) throw notFound('Invoice not found')
  if (data.magic_link_revoked_at) throw unauthorized('Link revoked')
  if (data.status === 'draft') throw badRequest('Invoice not yet sent')
  const lines = (data.invoice_line_items ?? []) as InvoiceLineItemRow[]
  const { invoice_line_items: _omit, ...invoice } = data as InvoiceRow & {
    invoice_line_items: InvoiceLineItemRow[]
  }
  return { invoice: invoice as InvoiceRow, lines }
}
