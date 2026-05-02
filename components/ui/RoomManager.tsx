'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import Button from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { toast } from '@/components/ui/Toast'
import type { Room } from '@/lib/types-ui'

export function ManageRoomsButton({
  projectId,
  rooms,
  onChange,
}: {
  projectId: string
  rooms: Room[]
  onChange: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Rooms ({rooms.length})
      </Button>
      <ManageRoomsModal
        open={open}
        onClose={() => setOpen(false)}
        projectId={projectId}
        rooms={rooms}
        onChange={onChange}
      />
    </>
  )
}

export function ManageRoomsModal({
  open,
  onClose,
  projectId,
  rooms,
  onChange,
}: {
  open: boolean
  onClose: () => void
  projectId: string
  rooms: Room[]
  onChange: () => void
}) {
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    try {
      await api.post(`/api/projects/${projectId}/rooms`, {
        name: name.trim(),
        position: rooms.length,
      })
      setName('')
      onChange()
      toast.success('Room added')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this room? Items in it will become unassigned.')) return
    try {
      await api.del(`/api/projects/${projectId}/rooms/${id}`)
      onChange()
      toast.success('Room deleted')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const rename = async (id: string, value: string) => {
    if (!value.trim()) return
    try {
      await api.patch(`/api/projects/${projectId}/rooms/${id}`, {
        name: value.trim(),
      })
      onChange()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Rooms">
      <p className="font-garamond text-[0.95rem] text-hm-nav mb-5">
        Rooms organize items, proposal pages, and floor-plan pins. Add as
        many as you need — “Living Room,” “Primary Bedroom,” “Back Hall.”
      </p>

      {rooms.length > 0 ? (
        <div className="border border-hm-text/10 mb-5">
          {rooms.map((r, i) => (
            <RoomRow
              key={r.id}
              room={r}
              first={i === 0}
              onRename={(v) => rename(r.id, v)}
              onDelete={() => remove(r.id)}
            />
          ))}
        </div>
      ) : null}

      <form onSubmit={add}>
        <Field label="Add a room">
          <div className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Living Room"
              autoFocus
            />
            <Button type="submit" variant="primary" loading={submitting}>
              Add
            </Button>
          </div>
        </Field>
      </form>

      <div className="flex justify-end pt-2">
        <Button variant="ghost" onClick={onClose}>
          Done
        </Button>
      </div>
    </Modal>
  )
}

function RoomRow({
  room,
  first,
  onRename,
  onDelete,
}: {
  room: Room
  first: boolean
  onRename: (v: string) => void
  onDelete: () => void
}) {
  const [v, setV] = useState(room.name)
  return (
    <div
      className={[
        'flex items-center justify-between gap-2 px-3 py-2',
        first ? '' : 'border-t border-hm-text/10',
      ].join(' ')}
    >
      <Input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== room.name && onRename(v)}
        className="!border-transparent hover:!border-hm-text/15 focus:!border-hm-text/60"
      />
      <button
        onClick={onDelete}
        className="font-sans text-[10px] uppercase tracking-[0.2em] text-hm-nav hover:text-red-700 px-3"
      >
        Delete
      </button>
    </div>
  )
}
