import { notFound } from 'next/navigation'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withSignedUrls, withSignedUrlsList } from '@/lib/storage'
import FloorPlanClient from './FloorPlanClient'
import type { Project, Item, Room } from '@/lib/types-ui'

export default async function FloorPlanPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const { designerId } = await requireDesigner()
  const sb = supabaseAdmin()

  const [pRes, iRes, rRes] = await Promise.all([
    sb
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('designer_id', designerId)
      .maybeSingle(),
    sb
      .from('items')
      .select('*')
      .eq('project_id', projectId)
      .eq('designer_id', designerId)
      .order('created_at', { ascending: false }),
    sb
      .from('rooms')
      .select('*')
      .eq('project_id', projectId)
      .eq('designer_id', designerId)
      .order('position', { ascending: true }),
  ])

  if (!pRes.data) notFound()

  const [project, items] = await Promise.all([
    withSignedUrls(pRes.data as Project, ['floor_plan_url'] as const),
    withSignedUrlsList((iRes.data ?? []) as Item[], 'image_url'),
  ])

  return (
    <FloorPlanClient
      projectId={projectId}
      initialProject={project as Project}
      initialItems={items}
      initialRooms={(rRes.data ?? []) as Room[]}
    />
  )
}
