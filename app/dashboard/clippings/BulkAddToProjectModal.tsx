'use client'

import { useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Field, Select } from '@/components/ui/Input'
import { toast } from '@/components/ui/Toast'
import { formatCents } from '@/lib/format'
import type { Room } from '@/lib/types-ui'

interface Props {
  open: boolean
  selectedCount: number
  totalCents: number
  selectedIds: string[]
  projects: Array<{ id: string; name: string }>
  onClose: () => void
  onAdded: (okCount: number) => void
}

interface BulkResult {
  project_id: string
  ok_count: number
  results: Array<{ clipping_item_id: string; ok: boolean; error?: string }>
}

export default function BulkAddToProjectModal({
  open,
  selectedCount,
  totalCents,
  selectedIds,
  projects,
  onClose,
  onAdded,
}: Props) {
  const [projectId, setProjectId] = useState('')
  const [rooms, setRooms] = useState<Room[]>([])
  const [roomId, setRoomId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setProjectId(projects[0]?.id ?? '')
    setRoomId('')
  }, [open, projects])

  useEffect(() => {
    if (!open || !projectId) {
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
  }, [open, projectId])

  if (!open) return null

  const submit = async () => {
    if (!projectId) {
      toast.error('Pick a project first')
      return
    }
    setSubmitting(true)
    try {
      const res = await api.post<BulkResult>('/api/clippings/bulk-add-to-project', {
        project_id: projectId,
        room_id: roomId || null,
        clipping_ids: selectedIds,
      })
      const data = res.data as BulkResult
      const ok = data?.ok_count ?? 0
      const failed = selectedIds.length - ok
      if (failed > 0) {
        toast.info(`Added ${ok} · ${failed} failed`)
      } else {
        toast.success(`Added ${ok} to project`)
      }
      onAdded(ok)
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to add'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={true} onClose={onClose} title="Add selected to project">
      <div className="mb-5 pb-5 border-b border-hm-text/10">
        <div className="font-serif text-[1.1rem] leading-tight">
          {selectedCount} {selectedCount === 1 ? 'clipping' : 'clippings'} selected
        </div>
        <div className="font-garamond text-[0.9rem] text-hm-nav mt-1">
          Total: {formatCents(totalCents)}
        </div>
      </div>

      <Field label="Project">
        {projects.length === 0 ? (
          <div className="text-[12px] text-hm-nav">No active projects yet.</div>
        ) : (
          <Select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        )}
      </Field>

      {rooms.length > 0 ? (
        <Field label="Room (optional)">
          <Select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">No room</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          onClick={onClose}
          className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav hover:text-hm-text"
        >
          Cancel
        </button>
        <Button onClick={submit} loading={submitting} disabled={!projectId}>
          Add {selectedCount} to project
        </Button>
      </div>
    </Modal>
  )
}
