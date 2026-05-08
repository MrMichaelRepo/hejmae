import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withSignedUrlsList } from '@/lib/storage'
import ProposalClient, { type ProposalWithRooms } from './ProposalClient'
import type { Room, Item } from '@/lib/types-ui'

export default async function ProposalPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const { designerId } = await requireDesigner()
  const sb = supabaseAdmin()

  const [pRes, rRes, iRes] = await Promise.all([
    sb
      .from('proposals')
      .select('*, proposal_rooms(*)')
      .eq('project_id', projectId)
      .eq('designer_id', designerId)
      .order('created_at', { ascending: false }),
    sb
      .from('rooms')
      .select('*')
      .eq('project_id', projectId)
      .eq('designer_id', designerId)
      .order('position', { ascending: true }),
    sb
      .from('items')
      .select('*')
      .eq('project_id', projectId)
      .eq('designer_id', designerId)
      .order('created_at', { ascending: false }),
  ])

  return (
    <ProposalClient
      projectId={projectId}
      initialProposals={(pRes.data ?? []) as ProposalWithRooms[]}
      initialRooms={(rRes.data ?? []) as Room[]}
      initialItems={await withSignedUrlsList(
        (iRes.data ?? []) as Item[],
        'image_url',
      )}
    />
  )
}
