'use client'

import { useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Input'
import { toast } from '@/components/ui/Toast'
import type { ClippingItemFeedRow, Room } from '@/lib/types-ui'

interface Props {
  clipping: ClippingItemFeedRow | null
  projects: Array<{ id: string; name: string }>
  onClose: () => void
  onAdded: () => void
}

export default function AddClippingToProjectModal({
  clipping,
  projects,
  onClose,
  onAdded,
}: Props) {
  const [projectId, setProjectId] = useState('')
  const [rooms, setRooms] = useState<Room[]>([])
  const [roomId, setRoomId] = useState('')
  const [trade, setTrade] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Reset state whenever a new clipping is opened, preferring the
  // project the clipping was already tagged with.
  useEffect(() => {
    if (!clipping) return
    const initial =
      clipping.project_id ??
      (projects[0]?.id ?? '')
    setProjectId(initial)
    setRoomId('')
    setTrade('')
  }, [clipping, projects])

  // Load rooms whenever the active project changes.
  useEffect(() => {
    if (!clipping || !projectId) {
      setRooms([])
      return
    }
    let cancelled = false
    api
      .get<Room[]>(`/api/projects/${projectId}/rooms`)
      .then((r) => {
        if (!cancelled) setRooms((r.data as Room[]) ?? [])
      })
      .catch(() => {
        if (!cancelled) setRooms([])
      })
    return () => {
      cancelled = true
    }
  }, [clipping, projectId])

  if (!clipping) return null

  const submit = async () => {
    if (!projectId) {
      toast.error('Pick a project first')
      return
    }
    setSubmitting(true)
    try {
      await api.post(`/api/clippings/${clipping.id}/add-to-project`, {
        project_id: projectId,
        room_id: roomId || null,
        trade_price_cents: trade
          ? Math.round(Number(trade) * 100)
          : null,
      })
      toast.success('Added to project')
      onAdded()
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to add'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={true} onClose={onClose} title="Add to project">
      <div className="mb-5 pb-5 border-b border-line">
        <div className="font-serif text-[1.1rem] leading-tight">
          {clipping.name?.trim() || clipping.source_url}
        </div>
        {clipping.brand ? (
          <div className="font-garamond text-[0.9rem] text-ink-muted mt-1">
            {clipping.brand}
          </div>
        ) : null}
      </div>

      <Field label="Project">
        {projects.length === 0 ? (
          <div className="font-garamond text-[0.95rem] text-ink-muted border border-line px-3 py-2.5">
            No active projects. Create one first.
          </div>
        ) : (
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label="Room (optional)">
        <Select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          <option value="">No room yet</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Your trade price (USD, optional)">
        <Input
          value={trade}
          onChange={(e) => setTrade(e.target.value)}
          inputMode="decimal"
          placeholder="0.00"
        />
      </Field>

      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={submit}
          loading={submitting}
          disabled={projects.length === 0}
        >
          Add to project
        </Button>
      </div>
    </Modal>
  )
}
