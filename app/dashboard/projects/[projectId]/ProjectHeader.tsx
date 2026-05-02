'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { formatCents } from '@/lib/format'
import { StatusBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import EditProjectModal from './EditProjectModal'
import type { Project, Client } from '@/lib/types-ui'

export default function ProjectHeader({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [openEdit, setOpenEdit] = useState(false)

  const load = () => {
    api.get<Project>(`/api/projects/${projectId}`).then(async (r) => {
      const p = r.data as Project
      setProject(p)
      if (p?.client_id) {
        const c = await api.get<Client>(`/api/clients/${p.client_id}`)
        setClient((c.data as Client) ?? null)
      } else {
        setClient(null)
      }
    }).catch(() => {})
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  if (!project) {
    return <div className="h-20 mb-2 animate-pulse bg-hm-text/[0.04] rounded-sm" />
  }

  return (
    <div className="mb-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="font-serif text-[clamp(1.7rem,2.6vw,2.4rem)] leading-[1.1] tracking-[-0.015em]">
            {project.name}
          </h1>
          <div className="mt-2 font-garamond text-[1rem] text-hm-nav">
            {client?.name ?? 'No client'}
            {project.location ? ` · ${project.location}` : ''}
            {project.budget_cents != null
              ? ` · Budget ${formatCents(project.budget_cents)}`
              : ''}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge kind="project" status={project.status} />
          <Button variant="ghost" size="sm" onClick={() => setOpenEdit(true)}>
            Edit
          </Button>
        </div>
      </div>

      <EditProjectModal
        open={openEdit}
        onClose={() => setOpenEdit(false)}
        project={project}
        onSaved={(p) => {
          setProject(p)
          setOpenEdit(false)
          load()
        }}
      />
    </div>
  )
}
