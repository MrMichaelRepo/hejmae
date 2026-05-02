'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { formatDateTime, titleCase } from '@/lib/format'
import { PageSpinner } from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import type { ActivityLog } from '@/lib/types-ui'

export default function ActivityClient({ projectId }: { projectId: string }) {
  const [logs, setLogs] = useState<ActivityLog[] | null>(null)

  useEffect(() => {
    api.get<ActivityLog[]>(`/api/projects/${projectId}/activity`).then((r) => {
      setLogs((r.data as ActivityLog[]) ?? [])
    })
  }, [projectId])

  if (logs === null) return <PageSpinner />
  if (logs.length === 0)
    return (
      <EmptyState
        title="No activity yet"
        body="Every action — adding items, sending proposals, recording payments — appears here."
        small
      />
    )

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
