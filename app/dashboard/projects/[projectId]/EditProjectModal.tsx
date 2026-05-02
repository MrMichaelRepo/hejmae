'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import Button from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { toast } from '@/components/ui/Toast'
import type { Project, Client, ProjectStatus, PricingMode } from '@/lib/types-ui'

export default function EditProjectModal({
  open,
  onClose,
  project,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  project: Project
  onSaved: (p: Project) => void
}) {
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [name, setName] = useState(project.name)
  const [status, setStatus] = useState<ProjectStatus>(project.status)
  const [clientId, setClientId] = useState(project.client_id ?? '')
  const [location, setLocation] = useState(project.location ?? '')
  const [budget, setBudget] = useState(
    project.budget_cents != null ? String(project.budget_cents / 100) : '',
  )
  const [pricingMode, setPricingMode] = useState<PricingMode>(project.pricing_mode)
  const [markupPct, setMarkupPct] = useState(String(project.markup_percent))
  const [notes, setNotes] = useState(project.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (open)
      api.get<Client[]>('/api/clients').then((r) =>
        setClients((r.data as Client[]) ?? []),
      )
  }, [open])

  const save = async () => {
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        status,
        client_id: clientId || null,
        location: location.trim() || null,
        notes: notes.trim() || null,
        pricing_mode: pricingMode,
        markup_percent: Number(markupPct) || 0,
      }
      if (budget) body.budget_cents = Math.round(Number(budget) * 100)
      else body.budget_cents = null
      const res = await api.patch<Project>(
        `/api/projects/${project.id}`,
        body,
      )
      onSaved((res.data as Project) ?? project)
      toast.success('Project updated')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const archive = async () => {
    if (!confirm('Archive this project? It can be reopened from settings.')) return
    setDeleting(true)
    try {
      await api.del(`/api/projects/${project.id}`)
      toast.success('Project archived')
      router.push('/dashboard/projects')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Project settings" size="lg">
      <Field label="Name">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Status">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as ProjectStatus)}
          >
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </Select>
        </Field>
        <Field label="Client">
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">No client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Location">
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
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

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Pricing mode"
          hint="Retail = catalog price to client. Cost-plus = trade × markup."
        >
          <Select
            value={pricingMode}
            onChange={(e) => setPricingMode(e.target.value as PricingMode)}
          >
            <option value="retail">Retail</option>
            <option value="cost_plus">Cost plus</option>
          </Select>
        </Field>
        <Field label="Markup %">
          <Input
            value={markupPct}
            onChange={(e) => setMarkupPct(e.target.value)}
            inputMode="decimal"
          />
        </Field>
      </div>

      <Field label="Notes">
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </Field>

      <div className="flex justify-between gap-3 pt-2">
        <Button variant="danger" onClick={archive} loading={deleting}>
          Archive project
        </Button>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={saving}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  )
}
