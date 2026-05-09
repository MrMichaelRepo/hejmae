// Server-side PDF rendering for invoices.
//
// Uses @react-pdf/renderer in Node runtime (it pulls fontkit + restructure
// which aren't edge-compatible). The document component lives at
// lib/pdf/InvoicePDF.tsx so it can be reused if we ever want to email the
// PDF as an attachment.
import { NextResponse, type NextRequest } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling, notFound } from '@/lib/errors'
import { resolveAssetUrl } from '@/lib/storage'
import InvoicePDF, { type InvoicePDFData } from '@/lib/pdf/InvoicePDF'
import type { InvoiceRow, InvoiceLineItemRow, PaymentRow } from '@/lib/supabase/types'

export const runtime = 'nodejs'

interface Ctx {
  params: Promise<{ projectId: string; invoiceId: string }>
}

interface InvoiceWithRelations extends InvoiceRow {
  invoice_line_items: InvoiceLineItemRow[]
  payments: PaymentRow[]
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId, invoiceId } = await params
    const { designerId, user } = await requireDesigner()
    const sb = supabaseAdmin()

    const [invRes, projRes] = await Promise.all([
      sb
        .from('invoices')
        .select('*, invoice_line_items(*), payments(*)')
        .eq('id', invoiceId)
        .eq('project_id', projectId)
        .eq('designer_id', designerId)
        .maybeSingle(),
      sb
        .from('projects')
        .select('id, name, location, client_id')
        .eq('id', projectId)
        .eq('designer_id', designerId)
        .maybeSingle(),
    ])

    if (!invRes.data || !projRes.data) throw notFound('Invoice not found')

    const invoice = invRes.data as InvoiceWithRelations
    const project = projRes.data

    const client = project.client_id
      ? (
          await sb
            .from('clients')
            .select('name, email')
            .eq('id', project.client_id)
            .eq('designer_id', designerId)
            .maybeSingle()
        ).data
      : null

    const paymentsTotal = (invoice.payments ?? []).reduce(
      (a, p) => a + p.amount_cents,
      0,
    )

    const data: InvoicePDFData = {
      invoice: {
        id: invoice.id,
        type: invoice.type,
        status: invoice.status,
        total_cents: invoice.total_cents,
        sent_at: invoice.sent_at,
        paid_at: invoice.paid_at,
        notes: invoice.notes,
        created_at: invoice.created_at,
      },
      lines: (invoice.invoice_line_items ?? []).map((l) => ({
        id: l.id,
        description: l.description,
        quantity: l.quantity,
        unit_price_cents: l.unit_price_cents,
        total_price_cents: l.total_price_cents,
        position: l.position,
      })),
      payments_total_cents: paymentsTotal,
      project: { name: project.name, location: project.location },
      client: client ? { name: client.name, email: client.email } : null,
      designer: {
        studio_name: user.studio_name,
        name: user.name,
        // PDF generation embeds the logo by URL; sign it server-side.
        logo_url: await resolveAssetUrl(user.logo_url),
        brand_color: user.brand_color,
      },
    }

    const buffer = await renderToBuffer(<InvoicePDF data={data} />)
    const filename = `invoice-${invoice.id.slice(0, 8)}.pdf`

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, max-age=0, must-revalidate',
      },
    })
  })
}
