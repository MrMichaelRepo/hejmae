import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import ProjectsClient, { type ProjectListItem, type ClientListItem } from './ProjectsClient'

export default async function ProjectsPage() {
  const { designerId } = await requireDesigner()
  const sb = supabaseAdmin()

  const [projectsRes, clientsRes] = await Promise.all([
    sb
      .from('projects')
      .select('*')
      .eq('designer_id', designerId)
      .order('created_at', { ascending: false }),
    sb
      .from('clients')
      .select('id, name')
      .eq('designer_id', designerId)
      .order('name', { ascending: true }),
  ])

  const projects = (projectsRes.data ?? []) as ProjectListItem[]
  const clients = (clientsRes.data ?? []) as ClientListItem[]

  return <ProjectsClient initialProjects={projects} initialClients={clients} />
}
