import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withSignedUrlsList } from '@/lib/storage'
import ItemsClient from './ItemsClient'
import type { Item, Room } from '@/lib/types-ui'

export default async function ItemsPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const { designerId } = await requireDesigner()
  const sb = supabaseAdmin()

  const [itemsRes, roomsRes] = await Promise.all([
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

  const items = await withSignedUrlsList(
    (itemsRes.data ?? []) as Item[],
    'image_url',
  )

  return (
    <ItemsClient
      projectId={projectId}
      initialItems={items}
      initialRooms={(roomsRes.data ?? []) as Room[]}
    />
  )
}
