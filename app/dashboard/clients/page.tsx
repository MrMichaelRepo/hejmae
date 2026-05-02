'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/ui/EmptyState'
import EmptyState from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PageSpinner } from '@/components/ui/Spinner'
import { toast } from '@/components/ui/Toast'
import { ClientFormModal } from './ClientFormModal'
import type { Client, Project } from '@/lib/types-ui'

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[] | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [search, setSearch] = useState('')
  const [openCreate, setOpenCreate] = useState(false)

  const load = async () => {
    const [c, p] = await Promise.all([
      api.get<Client[]>('/api/clients'),
      api.get<Project[]>('/api/projects'),
    ])
    setClients((c.data as Client[]) ?? [])
    setProjects((p.data as Project[]) ?? [])
  }
  useEffect(() => {
    load()
  }, [])

  const filtered = (clients ?? []).filter((c) =>
    search ? c.name.toLowerCase().includes(search.toLowerCase()) : true,
  )

  return (
    <div className="max-w-5xl">
      <PageHeader
        eyebrow="Clients"
        title="Client directory"
        subtitle="Every client and the projects connected to them."
        actions={
          <Button variant="primary" onClick={() => setOpenCreate(true)}>
            + New client
          </Button>
        }
      />

      <Input
        placeholder="Search clients…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm mb-6"
      />

      {clients === null ? (
        <PageSpinner />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={clients.length === 0 ? 'No clients yet' : 'No matches'}
          body={
            clients.length === 0
              ? 'Add a client so you can attach projects, proposals, and invoices.'
              : 'Try a different search term.'
          }
          action={
            clients.length === 0 ? (
              <Button variant="primary" onClick={() => setOpenCreate(true)}>
                Add first client
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="border border-hm-text/10">
          {filtered.map((c, i) => {
            const cp = projects.filter((p) => p.client_id === c.id)
            return (
              <Link
                key={c.id}
                href={`/dashboard/clients/${c.id}`}
                className={[
                  'grid grid-cols-[2fr_2fr_1fr_auto] gap-4 items-center px-5 py-4 hover:bg-hm-text/[0.03] transition-colors',
                  i > 0 ? 'border-t border-hm-text/10' : '',
                ].join(' ')}
              >
                <div className="font-serif text-[1.1rem] leading-tight truncate">
                  {c.name}
                </div>
                <div className="font-garamond text-[0.95rem] text-hm-nav truncate">
                  {c.email ?? '—'}
                </div>
                <div className="font-garamond text-[0.95rem] text-hm-nav hidden sm:block">
                  {c.phone ?? '—'}
                </div>
                <div className="font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav/80">
                  {cp.length} {cp.length === 1 ? 'project' : 'projects'}
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <ClientFormModal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        onSaved={() => {
          setOpenCreate(false)
          load()
          toast.success('Client added')
        }}
      />
    </div>
  )
}
