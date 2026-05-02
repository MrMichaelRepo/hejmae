'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api, ApiError } from '@/lib/api'
import { formatCents, formatRelative } from '@/lib/format'
import { PageHeader } from '@/components/ui/EmptyState'
import EmptyState from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { PageSpinner } from '@/components/ui/Spinner'
import { toast } from '@/components/ui/Toast'

interface ProjectListItem {
  id: string
  name: string
  status: 'active' | 'completed' | 'archived'
  client_id: string | null
  budget_cents: number | null
  location: string | null
  updated_at: string
}

interface ClientListItem {
  id: string
  name: string
}

type StatusFilter = 'all' | 'active' | 'completed' | 'archived'

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectListItem[] | null>(null)
  const [clients, setClients] = useState<ClientListItem[]>([])
  const [filter, setFilter] = useState<StatusFilter>('active')
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [openCreate, setOpenCreate] = useState(false)

  const load = () => {
    Promise.all([
      api.get<ProjectListItem[]>('/api/projects'),
      api.get<ClientListItem[]>('/api/clients'),
    ])
      .then(([p, c]) => {
        setProjects((p.data as ProjectListItem[]) ?? [])
        setClients((c.data as ClientListItem[]) ?? [])
      })
      .catch((e: ApiError) => setError(e.message))
  }

  useEffect(load, [])

  const filtered = (projects ?? [])
    .filter((p) => filter === 'all' || p.status === filter)
    .filter((p) =>
      search ? p.name.toLowerCase().includes(search.toLowerCase()) : true,
    )

  return (
    <div className="max-w-6xl">
      <PageHeader
        eyebrow="Projects"
        title="All projects"
        subtitle="Every project, sourced and billed from one place."
        actions={
          <Button variant="primary" onClick={() => setOpenCreate(true)}>
            + New project
          </Button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex gap-px bg-hm-text/10 rounded-sm overflow-hidden">
          {(['active', 'completed', 'archived', 'all'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={[
                'font-sans text-[10px] uppercase tracking-[0.2em] px-4 py-2 transition-colors',
                filter === s
                  ? 'bg-hm-text text-bg'
                  : 'bg-bg text-hm-nav hover:text-hm-text',
              ].join(' ')}
            >
              {s}
            </button>
          ))}
        </div>
        <Input
          placeholder="Search projects…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
      </div>

      {error ? (
        <div className="border border-red-700/30 p-4 font-garamond text-red-900">
          {error}
        </div>
      ) : projects === null ? (
        <PageSpinner />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={projects.length === 0 ? 'No projects yet' : 'No matches'}
          body={
            projects.length === 0
              ? 'Create your first project to start sourcing, building proposals, and invoicing.'
              : 'Try a different filter or search term.'
          }
          action={
            projects.length === 0 ? (
              <Button variant="primary" onClick={() => setOpenCreate(true)}>
                Create first project
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="border border-hm-text/10">
          {filtered.map((p, i) => {
            const client = clients.find((c) => c.id === p.client_id)
            return (
              <Link
                key={p.id}
                href={`/dashboard/projects/${p.id}`}
                className={[
                  'grid grid-cols-[1fr_auto_auto_auto] gap-6 items-center px-5 py-4 hover:bg-hm-text/[0.03] transition-colors',
                  i > 0 ? 'border-t border-hm-text/10' : '',
                ].join(' ')}
              >
                <div className="min-w-0">
                  <div className="font-serif text-[1.1rem] leading-tight truncate">
                    {p.name}
                  </div>
                  <div className="font-garamond text-[0.9rem] text-hm-nav truncate mt-0.5">
                    {client?.name ?? 'No client'}
                    {p.location ? ` · ${p.location}` : ''}
                  </div>
                </div>
                <div className="font-garamond text-[0.95rem] text-hm-nav hidden md:block">
                  {formatCents(p.budget_cents)}
                </div>
                <div className="font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav/70 hidden md:block">
                  {formatRelative(p.updated_at)}
                </div>
                <StatusBadge kind="project" status={p.status} />
              </Link>
            )
          })}
        </div>
      )}

      <CreateProjectModal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        clients={clients}
        onCreated={() => {
          setOpenCreate(false)
          load()
          toast.success('Project created')
        }}
      />
    </div>
  )
}

function CreateProjectModal({
  open,
  onClose,
  clients,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  clients: ClientListItem[]
  onCreated: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [clientId, setClientId] = useState('')
  const [location, setLocation] = useState('')
  const [budget, setBudget] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setErr(null)
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        location: location.trim() || null,
        notes: notes.trim() || null,
      }
      if (clientId) body.client_id = clientId
      if (budget) {
        const cents = Math.round(Number(budget) * 100)
        if (!isNaN(cents)) body.budget_cents = cents
      }
      const res = await api.post<{ id: string }>('/api/projects', body)
      const id = (res.data as { id: string } | undefined)?.id
      if (id) onCreated(id)
      setName('')
      setClientId('')
      setLocation('')
      setBudget('')
      setNotes('')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New project">
      <form onSubmit={submit}>
        <Field label="Project name" error={err && !name ? err : undefined}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            placeholder="e.g. Westlake Residence"
          />
        </Field>

        <Field label="Client">
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">No client yet</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Location">
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="City, neighborhood…"
            />
          </Field>
          <Field label="Budget (USD)">
            <Input
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              inputMode="decimal"
              placeholder="50000"
            />
          </Field>
        </div>

        <Field label="Notes">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Internal scope, kick-off date, design direction…"
          />
        </Field>

        {err ? (
          <div className="mb-4 border border-red-700/30 px-3 py-2 font-garamond text-[0.9rem] text-red-900">
            {err}
          </div>
        ) : null}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting}>
            Create project
          </Button>
        </div>
      </form>
    </Modal>
  )
}
