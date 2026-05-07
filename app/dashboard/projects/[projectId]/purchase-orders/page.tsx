import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import POsClient, { type POWith } from './POsClient'
import type { Item } from '@/lib/types-ui'

export default async function POsPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const { designerId } = await requireDesigner()
  const sb = supabaseAdmin()

  const [posRes, itemsRes] = await Promise.all([
    sb
      .from('purchase_orders')
      .select('*, purchase_order_line_items(*)')
      .eq('project_id', projectId)
      .eq('designer_id', designerId)
      .order('created_at', { ascending: false }),
    sb
      .from('items')
      .select('*')
      .eq('project_id', projectId)
      .eq('designer_id', designerId)
      .order('created_at', { ascending: false }),
  ])

  return (
    <POsClient
      projectId={projectId}
      initialPOs={(posRes.data ?? []) as POWith[]}
      initialItems={(itemsRes.data ?? []) as Item[]}
    />
  )
}
