import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import ClientsClient from './ClientsClient'
import type { Client, Project } from '@/lib/types-ui'

export default async function ClientsPage() {
  const { designerId } = await requireDesigner()
  const sb = supabaseAdmin()

  const [clientsRes, projectsRes] = await Promise.all([
    sb
      .from('clients')
      .select('*')
      .eq('designer_id', designerId)
      .order('name', { ascending: true }),
    sb
      .from('projects')
      .select('id, client_id')
      .eq('designer_id', designerId),
  ])

  return (
    <ClientsClient
      initialClients={(clientsRes.data ?? []) as Client[]}
      initialProjects={(projectsRes.data ?? []) as Project[]}
    />
  )
}
