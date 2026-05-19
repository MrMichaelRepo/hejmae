// POST /api/projects/[projectId]/invoices/[invoiceId]/email/draft
//
// Returns a `{subject, body_html}` prefill for the Send modal. No mutation,
// no send. Two modes:
//   * 'template' (deterministic, no LLM call)
//   * 'ai'       (Claude Haiku 4.5; falls back to template if API key missing
//                 or the call fails)
//
// The studio default lives on `studios.default_invoice_email_mode` and is
// looked up via getStudioFinanceSettings on the client side — the request
// always carries an explicit `mode` so this route never decides on its own.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { loadOwnedProject } from '@/lib/auth/ownership'
import { withErrorHandling, badRequest } from '@/lib/errors'
import {
  loadEmailContext,
  daysOverdue,
  assertCanSendReminder,
  assertCanSendInitial,
} from '@/lib/invoices/email-helpers'
import { templateInvoiceEmail } from '@/lib/email/invoice-template'
import { draftInvoiceEmail, isAnthropicConfigured } from '@/lib/ai/anthropic'

const schema = z.object({
  mode: z.enum(['template', 'ai']),
  kind: z.enum(['initial', 'reminder']),
  tone: z.enum(['warm', 'professional', 'firm']).default('warm'),
  due_at: z.string().datetime().optional().nullable(),
})

interface Ctx {
  params: Promise<{ projectId: string; invoiceId: string }>
}

export async function POST(req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId, invoiceId } = await params
    const { designerId, role, permissions } = await requireDesigner()
    requirePermission({ role, permissions }, 'finances:manage_invoices')
    await loadOwnedProject(designerId, projectId)

    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      throw badRequest('Invalid draft request', parsed.error.flatten().fieldErrors)
    }
    const body = parsed.data

    const ctx = await loadEmailContext({ designerId, projectId, invoiceId })

    if (body.kind === 'reminder') assertCanSendReminder(ctx.invoice.status)
    else assertCanSendInitial(ctx.invoice.status)

    const tplInput = {
      brand: ctx.brand,
      client: { name: ctx.client?.name ?? 'there' },
      project: { name: ctx.project.name },
      invoice: {
        type: ctx.invoice.type,
        total_cents: ctx.invoice.total_cents,
        notes: ctx.invoice.notes,
        due_at: body.due_at ?? null,
        daysOverdue: daysOverdue(body.due_at),
      },
      kind: body.kind,
      tone: body.tone,
    }

    // Template path (also the AI fallback).
    const template = templateInvoiceEmail(tplInput)

    let out = template
    let source: 'template' | 'ai' = 'template'

    if (body.mode === 'ai' && isAnthropicConfigured()) {
      const ai = await draftInvoiceEmail(tplInput)
      if (ai) {
        out = ai
        source = 'ai'
      }
    }

    return NextResponse.json({
      data: { ...out, source },
    })
  })
}
