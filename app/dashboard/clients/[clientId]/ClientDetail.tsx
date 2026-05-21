'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { formatCents, formatDate } from '@/lib/format'
import Button from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { toast } from '@/components/ui/Toast'
import { ClientFormModal } from '../ClientFormModal'
import type { Client, Project } from '@/lib/types-ui'

interface Props {
  clientId: string
  initialClient: Client
  initialProjects: Project[]
}

export default function ClientDetail({ clientId, initialClient, initialProjects }: Props) {
  const router = useRouter()
  const [client, setClient] = useState<Client>(initialClient)
  const [projects, setProjects] = useState<Project[]>(initialProjects)
  const [openEdit, setOpenEdit] = useState(false)
  const confirm = useConfirm()

  const reload = async () => {
    const [c, p] = await Promise.all([
      api.get<Client>(`/api/clients/${clientId}`),
      api.get<Project[]>(`/api/projects?client_id=${clientId}`),
    ])
    if (c.data) setClient(c.data as Client)
    setProjects((p.data as Project[]) ?? [])
  }

  const remove = async () => {
    const ok = await confirm({
      title: 'Delete this client?',
      body: 'Projects will keep referencing them but the client record will be gone.',
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await api.del(`/api/clients/${clientId}`)
      toast.success('Client deleted')
      router.push('/dashboard/clients')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/clients"
        className="inline-block font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted hover:text-ink mb-6"
      >
        ← All clients
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-10">
        <div>
          <div className="font-sans text-[10px] uppercase tracking-[0.26em] text-ink-muted mb-3">
            Client
          </div>
          <h1 className="font-serif text-[clamp(1.7rem,2.6vw,2.4rem)] leading-[1.1] tracking-[-0.015em]">
            {client.name}
          </h1>
          <div className="mt-2 font-garamond text-[1rem] text-ink-muted space-x-3">
            {client.email ? <span>{client.email}</span> : null}
            {client.phone ? <span>· {client.phone}</span> : null}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => setOpenEdit(true)}>
            Edit
          </Button>
          <Button variant="danger" onClick={remove}>
            Delete
          </Button>
        </div>
      </div>

      {client.notes ? (
        <div className="border border-line p-5 mb-8 font-garamond text-[0.95rem] text-ink-muted whitespace-pre-wrap">
          {client.notes}
        </div>
      ) : null}

      <h2 className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted mb-3">
        Projects ({projects.length})
      </h2>
      {projects.length === 0 ? (
        <div className="font-garamond text-[1rem] text-ink-muted border border-dashed border-line p-6 text-center">
          No projects yet for this client.
        </div>
      ) : (
        <div className="border border-line">
          {projects.map((p, i) => (
            <Link
              key={p.id}
              href={`/dashboard/projects/${p.id}`}
              className={[
                'flex items-center justify-between gap-4 px-5 py-4 hover:bg-ink/[0.03] transition-colors',
                i > 0 ? 'border-t border-line' : '',
              ].join(' ')}
            >
              <div className="font-serif text-[1.05rem]">{p.name}</div>
              <div className="flex items-center gap-3">
                <span className="font-garamond text-[0.95rem] text-ink-muted">
                  {formatCents(p.budget_cents)}
                </span>
                <span className="font-garamond text-[0.85rem] text-ink-subtle hidden sm:inline">
                  {formatDate(p.updated_at)}
                </span>
                <StatusBadge kind="project" status={p.status} />
              </div>
            </Link>
          ))}
        </div>
      )}

      <ClientFormModal
        open={openEdit}
        onClose={() => setOpenEdit(false)}
        initial={client}
        onSaved={() => {
          setOpenEdit(false)
          reload()
          toast.success('Client updated')
        }}
      />
    </div>
  )
}
