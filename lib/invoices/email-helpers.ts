// Shared helpers for invoice email routes.
//
// All three of /email/draft, /email/send, and the legacy PATCH 'send' path
// load the same context: invoice + project + client + designer brand + the
// magic-link URL. Extracted here so the routes stay short.

import { supabaseAdmin } from '@/lib/supabase/server'
import { notFound, badRequest } from '@/lib/errors'
import { resolveAssetUrl } from '@/lib/storage'
import { env } from '@/lib/env'
import {
  generateMagicToken,
  hashToken,
  magicLinkExpiresAt,
} from '@/lib/tokens'
import type { DesignerBrand } from '@/lib/email/shell'

const EMAIL_ASSET_TTL_SEC = 60 * 60 * 24 * 30

export interface InvoiceEmailContext {
  invoice: {
    id: string
    type: 'deposit' | 'progress' | 'final'
    status: string
    total_cents: number
    notes: string | null
    magic_link_token: string | null
    sent_at: string | null
    refunded_cents: number
  }
  project: { id: string; name: string; client_id: string | null }
  client: { id: string; name: string; email: string | null } | null
  designer: {
    id: string
    email: string
    name: string | null
    studio_name: string | null
    brand_color: string | null
    logo_url: string | null
  }
  brand: DesignerBrand
}

export async function loadEmailContext(args: {
  designerId: string
  projectId: string
  invoiceId: string
}): Promise<InvoiceEmailContext> {
  const sb = supabaseAdmin()
  const { data: invoice, error: invErr } = await sb
    .from('invoices')
    .select(
      'id, type, status, total_cents, notes, magic_link_token, sent_at, refunded_cents',
    )
    .eq('id', args.invoiceId)
    .eq('project_id', args.projectId)
    .eq('designer_id', args.designerId)
    .maybeSingle()
  if (invErr) throw invErr
  if (!invoice) throw notFound('Invoice not found')

  const { data: project, error: projErr } = await sb
    .from('projects')
    .select('id, name, client_id')
    .eq('id', args.projectId)
    .eq('designer_id', args.designerId)
    .maybeSingle()
  if (projErr) throw projErr
  if (!project) throw notFound('Project not found')

  let client: InvoiceEmailContext['client'] = null
  if (project.client_id) {
    const { data: c } = await sb
      .from('clients')
      .select('id, name, email')
      .eq('id', project.client_id)
      .eq('designer_id', args.designerId)
      .maybeSingle()
    if (c) client = c
  }

  const { data: designer, error: designerErr } = await sb
    .from('users')
    .select('id, email, name, studio_name, brand_color, logo_url')
    .eq('id', args.designerId)
    .maybeSingle()
  if (designerErr) throw designerErr
  if (!designer) throw notFound('Designer record missing')

  const brand: DesignerBrand = {
    studio_name: designer.studio_name,
    name: designer.name,
    logo_url: await resolveAssetUrl(designer.logo_url, EMAIL_ASSET_TTL_SEC),
    brand_color: designer.brand_color,
  }

  return { invoice, project, client, designer, brand }
}

export function payUrlFromRawToken(rawToken: string): string {
  return `${env.appUrl()}/portal/invoices/${rawToken}`
}

// Mints a fresh magic-link token and returns the raw + hashed forms.
// Caller persists the hash on the invoice row.
export function mintMagicLink(): {
  raw: string
  hash: string
  expiresAt: string
} {
  const raw = generateMagicToken()
  return { raw, hash: hashToken(raw), expiresAt: magicLinkExpiresAt() }
}

export function assertCanSendReminder(status: string): void {
  if (status !== 'sent' && status !== 'partially_paid') {
    throw badRequest(
      "Reminders can only be sent for invoices already sent and not yet fully paid",
    )
  }
}

export function assertCanSendInitial(status: string): void {
  if (status === 'paid' || status === 'void') {
    throw badRequest(`Cannot send a ${status} invoice`)
  }
}

export function daysOverdue(dueAt: string | null | undefined): number | null {
  if (!dueAt) return null
  const due = new Date(dueAt).getTime()
  if (Number.isNaN(due)) return null
  const days = Math.floor((Date.now() - due) / (1000 * 60 * 60 * 24))
  return days > 0 ? days : null
}
