import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getStudioFinanceSettings } from '@/lib/finances/studio_settings'
import InvoicesClient, { type InvoiceWith } from './InvoicesClient'

export default async function InvoicesPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const { designerId, studioId, user } = await requireDesigner()

  const sb = supabaseAdmin()

  const [invoicesRes, projectRes, settings] = await Promise.all([
    sb
      .from('invoices')
      .select('*, invoice_line_items(*), payments(*)')
      .eq('project_id', projectId)
      .eq('designer_id', designerId)
      .order('created_at', { ascending: false }),
    sb
      .from('projects')
      .select('id, name, client_id')
      .eq('id', projectId)
      .eq('designer_id', designerId)
      .maybeSingle(),
    getStudioFinanceSettings(studioId),
  ])

  let clientName: string | null = null
  let clientEmail: string | null = null
  if (projectRes.data?.client_id) {
    const { data: client } = await sb
      .from('clients')
      .select('name, email')
      .eq('id', projectRes.data.client_id)
      .eq('designer_id', designerId)
      .maybeSingle()
    clientName = client?.name ?? null
    clientEmail = client?.email ?? null
  }

  return (
    <InvoicesClient
      projectId={projectId}
      initialInvoices={(invoicesRes.data ?? []) as InvoiceWith[]}
      clientName={clientName}
      clientEmail={clientEmail}
      studioEmail={user.email}
      studioName={user.studio_name ?? user.name ?? 'Studio'}
      brandColor={user.brand_color}
      defaultEmailMode={settings.default_invoice_email_mode}
    />
  )
}
