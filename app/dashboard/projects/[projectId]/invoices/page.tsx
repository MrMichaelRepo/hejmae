import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import InvoicesClient, { type InvoiceWith } from './InvoicesClient'

export default async function InvoicesPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const { designerId } = await requireDesigner()

  const { data } = await supabaseAdmin()
    .from('invoices')
    .select('*, invoice_line_items(*), payments(*)')
    .eq('project_id', projectId)
    .eq('designer_id', designerId)
    .order('created_at', { ascending: false })

  return (
    <InvoicesClient
      projectId={projectId}
      initialInvoices={(data ?? []) as InvoiceWith[]}
    />
  )
}
