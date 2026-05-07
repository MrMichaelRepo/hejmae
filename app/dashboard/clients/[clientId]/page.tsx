import { notFound } from 'next/navigation'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import ClientDetail from './ClientDetail'
import type { Client, Project } from '@/lib/types-ui'

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>
}) {
  const { clientId } = await params
  const { designerId } = await requireDesigner()
  const sb = supabaseAdmin()

  const [clientRes, projectsRes] = await Promise.all([
    sb
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .eq('designer_id', designerId)
      .maybeSingle(),
    sb
      .from('projects')
      .select('*')
      .eq('designer_id', designerId)
      .eq('client_id', clientId)
      .order('created_at', { ascending: false }),
  ])

  if (!clientRes.data) notFound()

  return (
    <ClientDetail
      clientId={clientId}
      initialClient={clientRes.data as Client}
      initialProjects={(projectsRes.data ?? []) as Project[]}
    />
  )
}
