// POST /api/projects/[projectId]/invoices/[invoiceId]/email/send
//
// Sends the invoice email with user-edited subject + body. Steps:
//   1. Sanitize the body HTML.
//   2. If kind='initial' and status='draft': mint a magic-link token,
//      flip status to 'sent', set sent_at. Magic link always rotates on
//      initial send (replaces the legacy PATCH action='send' flow).
//   3. Always (initial + reminder): assemble the email (sanitized body +
//      deterministic CTA footer + brand shell) and dispatch via Resend.
//   4. Append the sent draft to invoices.email_drafts JSONB log, bump
//      email_send_count, mirror the last subject/body.
//   5. Insert an activity_logs row.
//
// If sendEmail() soft-fails (no Resend key), we still persist the draft so
// it's visible in the audit log and the user can copy the pay link from
// the modal — but we don't flip status to 'sent'.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { loadOwnedProject } from '@/lib/auth/ownership'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, badRequest } from '@/lib/errors'
import { sendEmail } from '@/lib/email/send'
import { renderInvoiceShell } from '@/lib/email/render-invoice'
import { logActivity } from '@/lib/activity'
import { trySyncInvoice } from '@/lib/qbo/sync'
import {
  loadEmailContext,
  mintMagicLink,
  payUrlFromRawToken,
  assertCanSendInitial,
  assertCanSendReminder,
} from '@/lib/invoices/email-helpers'
import type { InvoiceEmailDraftLog } from '@/lib/supabase/types'

const recipientArr = z
  .array(z.string().email())
  .min(1, 'At least one recipient is required')
  .max(10)

const schema = z.object({
  kind: z.enum(['initial', 'reminder']),
  subject: z.string().min(1).max(200),
  body_html: z.string().min(1).max(50_000),
  recipients: recipientArr,
  cc: z.array(z.string().email()).max(10).default([]),
  reply_to: z.string().email().optional().nullable(),
})

interface Ctx {
  params: Promise<{ projectId: string; invoiceId: string }>
}

export async function POST(req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId, invoiceId } = await params
    const { designerId, user, role, permissions } = await requireDesigner()
    requirePermission({ role, permissions }, 'finances:manage_invoices')
    await loadOwnedProject(designerId, projectId)

    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      throw badRequest('Invalid send request', parsed.error.flatten().fieldErrors)
    }
    const body = parsed.data

    const ctx = await loadEmailContext({ designerId, projectId, invoiceId })

    if (body.kind === 'reminder') assertCanSendReminder(ctx.invoice.status)
    else assertCanSendInitial(ctx.invoice.status)

    // Always mint a fresh magic link on every send. Even for reminders we
    // can't reuse the existing token because only the hash is stored — the
    // recipient needs a working URL, so we rotate. Previous link stops
    // working as soon as the row is updated.
    const finalToken = mintMagicLink()
    const finalPayUrl = payUrlFromRawToken(finalToken.raw)

    // Build email payload.
    const rendered = renderInvoiceShell({
      brand: ctx.brand,
      subject: body.subject,
      bodyHtml: body.body_html,
      invoice: {
        type: ctx.invoice.type,
        totalCents: ctx.invoice.total_cents,
        payUrl: finalPayUrl,
      },
    })

    const emailResult = await sendEmail({
      to: body.recipients,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      replyTo: body.reply_to || ctx.designer.email,
      ...(body.cc.length ? { cc: body.cc } : {}),
    })

    const sentAt = new Date().toISOString()
    const draftLog: InvoiceEmailDraftLog = {
      kind: body.kind,
      subject: body.subject,
      body_html: body.body_html,
      recipients: body.recipients,
      cc: body.cc,
      reply_to: body.reply_to ?? null,
      sent_at: sentAt,
      sent_by: designerId,
      email_id: emailResult.id ?? null,
    }

    // Compose the row update. We always rotate the magic link so the modal
    // can return a fresh pay URL the designer can copy.
    const updates: Record<string, unknown> = {
      magic_link_token: finalToken.hash,
      magic_link_expires_at: finalToken.expiresAt,
      magic_link_revoked_at: null,
      last_email_subject: body.subject,
      last_email_body_html: body.body_html,
    }
    // Flip status only when this is the initial send AND the email actually
    // went out (or RESEND isn't configured — in which case we already
    // flagged it on the log; treat unconfigured Resend as "user is doing
    // out-of-band sends" and still mark sent). When Resend errors hard, we
    // keep status='draft' so the user can retry.
    const isSentOk = emailResult.ok || emailResult.reason === 'no_api_key'
    if (body.kind === 'initial' && ctx.invoice.status === 'draft' && isSentOk) {
      updates.status = 'sent'
      updates.sent_at = sentAt
    }

    // Append to email_drafts JSONB (read-modify-write — fine here since the
    // route is gated by single-user permissions and the log is append-only).
    const { data: existingDrafts } = await supabaseAdmin()
      .from('invoices')
      .select('email_drafts, email_send_count')
      .eq('id', invoiceId)
      .eq('designer_id', designerId)
      .single()
    const drafts = Array.isArray(existingDrafts?.email_drafts)
      ? (existingDrafts!.email_drafts as InvoiceEmailDraftLog[])
      : []
    drafts.push(draftLog)
    updates.email_drafts = drafts
    updates.email_send_count = (existingDrafts?.email_send_count ?? 0) + 1

    const { data, error } = await supabaseAdmin()
      .from('invoices')
      .update(updates)
      .eq('id', invoiceId)
      .eq('designer_id', designerId)
      .select(
        'id, status, sent_at, email_send_count, last_email_subject, refunded_cents, total_cents, type, notes',
      )
      .single()
    if (error) throw error

    await logActivity({
      designerId,
      projectId,
      actorType: 'designer',
      actorId: designerId,
      eventType: 'invoice.email_sent',
      description:
        body.kind === 'reminder'
          ? `Invoice reminder sent by ${user.name ?? 'designer'}`
          : `Invoice sent by ${user.name ?? 'designer'}${emailResult.ok ? ' (email delivered)' : emailResult.reason === 'no_api_key' ? ' (Resend not configured)' : ' (email send failed)'}`,
      metadata: {
        invoice_id: invoiceId,
        kind: body.kind,
        recipients: body.recipients,
        cc: body.cc,
        email_id: emailResult.id ?? null,
        email_result: emailResult,
      },
    })

    if (data.status !== 'draft' && data.status !== 'void') {
      trySyncInvoice(designerId, invoiceId)
    }

    return NextResponse.json({
      data,
      magic_link_url: finalPayUrl,
      email: emailResult,
    })
  })
}
