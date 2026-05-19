import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { loadOwnedProject } from '@/lib/auth/ownership'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, notFound, badRequest } from '@/lib/errors'
import {
  generateMagicToken,
  hashToken,
  magicLinkExpiresAt,
} from '@/lib/tokens'
import { logActivity } from '@/lib/activity'
import { env } from '@/lib/env'
import { updateInvoice as updateInvoiceSchema } from '@/lib/validations/invoice'

interface Ctx {
  params: Promise<{ projectId: string; invoiceId: string }>
}

async function loadInvoice(designerId: string, projectId: string, invoiceId: string) {
  const { data, error } = await supabaseAdmin()
    .from('invoices')
    .select('*, invoice_line_items(*), payments(*)')
    .eq('id', invoiceId)
    .eq('project_id', projectId)
    .eq('designer_id', designerId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw notFound('Invoice not found')
  return data
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId, invoiceId } = await params
    const { designerId, role, permissions } = await requireDesigner()
    requirePermission({ role, permissions }, 'finances:view')
    await loadOwnedProject(designerId, projectId)
    const inv = await loadInvoice(designerId, projectId, invoiceId)
    return NextResponse.json({ data: inv })
  })
}

// PATCH actions:
//   * 'mark_paid'    — manual mark as paid (e.g. paid by check).
//   * 'rotate_link'  — issue a fresh magic-link URL without re-emailing.
//   * 'edit_lines'   — replace line items on a draft invoice. Body shape
//                      matches updateInvoice (type/notes/lines).
//
// The previous 'send' action has been replaced by
// POST /api/projects/[projectId]/invoices/[invoiceId]/email/send, which
// supports user-edited subject + body and recipient overrides. The old
// path is gone — callers should use the new endpoint.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId, invoiceId } = await params
    const { designerId, role, permissions } = await requireDesigner()

    const raw = (await req.json()) as {
      action?: 'mark_paid' | 'rotate_link' | 'edit_lines' | 'send'
      notes?: string | null
      type?: 'deposit' | 'progress' | 'final'
      lines?: Array<{
        item_id?: string | null
        description: string
        quantity: number
        unit_price_cents: number
      }>
    }

    if (raw.action === 'send') {
      throw badRequest(
        "The 'send' action has moved. POST /api/projects/[projectId]/invoices/[invoiceId]/email/send",
      )
    }

    const permKey =
      raw.action === 'mark_paid'
        ? 'finances:record_payments'
        : 'finances:manage_invoices'
    requirePermission({ role, permissions }, permKey)
    await loadOwnedProject(designerId, projectId)
    const existing = await loadInvoice(designerId, projectId, invoiceId)

    // ----- edit_lines -----
    if (raw.action === 'edit_lines') {
      if (existing.status !== 'draft') {
        throw badRequest('Only draft invoices can be edited')
      }
      const parsed = updateInvoiceSchema.safeParse({
        type: raw.type,
        notes: raw.notes,
        lines: raw.lines,
      })
      if (!parsed.success) {
        throw badRequest(
          'Invalid edit payload',
          parsed.error.flatten().fieldErrors,
        )
      }
      const lines = parsed.data.lines ?? []
      if (!lines.length) throw badRequest('Invoice must have at least one line')

      const total = lines.reduce(
        (acc, l) => acc + l.unit_price_cents * l.quantity,
        0,
      )

      const sb = supabaseAdmin()
      const updates: Record<string, unknown> = { total_cents: total }
      if (parsed.data.type !== undefined) updates.type = parsed.data.type
      if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes

      const { error: invErr } = await sb
        .from('invoices')
        .update(updates)
        .eq('id', invoiceId)
        .eq('designer_id', designerId)
      if (invErr) throw invErr

      const { error: delErr } = await sb
        .from('invoice_line_items')
        .delete()
        .eq('invoice_id', invoiceId)
        .eq('designer_id', designerId)
      if (delErr) throw delErr

      const { error: insErr } = await sb
        .from('invoice_line_items')
        .insert(
          lines.map((l, i) => ({
            designer_id: designerId,
            invoice_id: invoiceId,
            item_id: l.item_id ?? null,
            description: l.description,
            quantity: l.quantity,
            unit_price_cents: l.unit_price_cents,
            total_price_cents: l.unit_price_cents * l.quantity,
            position: i,
          })),
        )
      if (insErr) throw insErr

      await logActivity({
        designerId,
        projectId,
        actorType: 'designer',
        actorId: designerId,
        eventType: 'invoice.edited',
        description: 'Invoice draft edited',
        metadata: { invoice_id: invoiceId, line_count: lines.length, total_cents: total },
      })

      const refreshed = await loadInvoice(designerId, projectId, invoiceId)
      return NextResponse.json({ data: refreshed })
    }

    // ----- status / link actions -----
    const updates: Record<string, unknown> = {}
    if (raw.notes !== undefined) updates.notes = raw.notes

    let rawToken: string | null = null

    if (raw.action === 'rotate_link') {
      if (existing.status === 'paid' || existing.status === 'void') {
        throw badRequest(`Cannot rotate link on ${existing.status} invoice`)
      }
      rawToken = generateMagicToken()
      updates.magic_link_token = hashToken(rawToken)
      updates.magic_link_expires_at = magicLinkExpiresAt()
      updates.magic_link_revoked_at = null
    } else if (raw.action === 'mark_paid') {
      if (existing.status === 'paid') throw badRequest('Invoice is already paid')
      if (existing.status === 'void') throw badRequest('Cannot mark a void invoice as paid')
      updates.status = 'paid'
      updates.paid_at = new Date().toISOString()
    }

    if (!Object.keys(updates).length) {
      throw badRequest('No valid fields to update')
    }

    const { data, error } = await supabaseAdmin()
      .from('invoices')
      .update(updates)
      .eq('id', invoiceId)
      .eq('designer_id', designerId)
      .select()
      .single()
    if (error) throw error

    if (raw.action === 'mark_paid') {
      const paidAlready = (existing.payments ?? []).reduce(
        (a: number, p: { amount_cents: number }) => a + p.amount_cents,
        0,
      )
      const manualAmount = Math.max(0, existing.total_cents - paidAlready)
      if (manualAmount > 0) {
        const { error: payErr } = await supabaseAdmin().from('payments').insert({
          designer_id: designerId,
          invoice_id: invoiceId,
          amount_cents: manualAmount,
          stripe_charge_id: null,
          stripe_payment_intent_id: null,
          platform_fee_cents: 0,
        })
        if (payErr) throw payErr
      }
    }

    // Strip the hashed token from the response — clients shouldn't see it.
    const { magic_link_token: _scrub, ...safeData } = data
    const out: Record<string, unknown> = { data: safeData }
    if (rawToken) {
      out.magic_link_url = `${env.appUrl()}/portal/invoices/${rawToken}`
    }
    return NextResponse.json(out)
  })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId, invoiceId } = await params
    const { designerId, role, permissions } = await requireDesigner()
    requirePermission({ role, permissions }, 'finances:manage_invoices')
    await loadOwnedProject(designerId, projectId)
    const existing = await loadInvoice(designerId, projectId, invoiceId)
    if (existing.status !== 'draft') {
      throw badRequest('Only draft invoices can be deleted')
    }
    const { error } = await supabaseAdmin()
      .from('invoices')
      .delete()
      .eq('id', invoiceId)
      .eq('designer_id', designerId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  })
}
