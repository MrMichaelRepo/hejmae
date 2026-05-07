import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { formatDateTime, titleCase } from '@/lib/format'
import EmptyState from '@/components/ui/EmptyState'
import type { ActivityLog } from '@/lib/types-ui'

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const { designerId } = await requireDesigner()

  const { data } = await supabaseAdmin()
    .from('activity_logs')
    .select('*')
    .eq('designer_id', designerId)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(200)

  const logs = (data ?? []) as ActivityLog[]

  if (logs.length === 0) {
    return (
      <EmptyState
        title="No activity yet"
        body="Every action — adding items, sending proposals, recording payments — appears here."
        small
      />
    )
  }

  return (
    <ol className="border-l border-hm-text/10 pl-6 space-y-5">
      {logs.map((l) => (
        <li key={l.id} className="relative">
          <span className="absolute -left-[27px] top-2 w-2 h-2 rounded-full bg-hm-text/30" />
          <div className="font-garamond text-[1rem] text-hm-text">
            {l.description}
          </div>
          <div className="font-sans text-[10px] uppercase tracking-[0.2em] text-hm-nav mt-1">
            {titleCase(l.actor_type)} ·{' '}
            <span className="text-hm-nav/70 normal-case tracking-normal font-garamond">
              {formatDateTime(l.created_at)}
            </span>
          </div>
        </li>
      ))}
    </ol>
  )
}
