'use client'

// Floor plan tab. The image is a normal <img> with overlay rectangles
// (rooms) and pins (items). All coords are stored 0..1 (fractions of image
// width/height) so the layout stays correct across screen sizes.
//
// Three modes drive interactivity:
//   - 'place'  — clicking on the floor plan places the selected item there
//   - 'draw'   — drag-to-create a new named room (rectangle)
//   - default  — clicking does nothing; rooms and pins are clickable
//
// Pin colors map to item status. Rooms are translucent labeled rectangles.
import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { PageSpinner } from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { ManageRoomsButton } from '@/components/ui/RoomManager'
import { toast } from '@/components/ui/Toast'
import { titleCase } from '@/lib/format'
import type { Project, Room, Item } from '@/lib/types-ui'

const PIN_COLOR: Record<string, string> = {
  sourcing: '#9ca3af',
  approved: '#b45309',
  ordered: '#15803d',
  received: '#0369a1',
  installed: '#0369a1',
}

type Mode = 'idle' | 'place' | 'draw'

interface DragRect {
  startX: number
  startY: number
  endX: number
  endY: number
}

export default function FloorPlanClient({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [selectedItem, setSelectedItem] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('idle')
  const [drag, setDrag] = useState<DragRect | null>(null)
  const [naming, setNaming] = useState<DragRect | null>(null)
  const [openUpload, setOpenUpload] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  const load = async () => {
    const [p, i, r] = await Promise.all([
      api.get<Project>(`/api/projects/${projectId}`),
      api.get<Item[]>(`/api/projects/${projectId}/items`),
      api.get<Room[]>(`/api/projects/${projectId}/rooms`),
    ])
    setProject(p.data as Project)
    setItems((i.data as Item[]) ?? [])
    setRooms((r.data as Room[]) ?? [])
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const fractionFromEvent = (e: React.MouseEvent) => {
    const rect = imgRef.current?.getBoundingClientRect()
    if (!rect) return null
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    }
  }

  const handleClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (mode !== 'place' || !selectedItem) return
    const f = fractionFromEvent(e)
    if (!f) return
    try {
      await api.patch(`/api/projects/${projectId}/items/${selectedItem}`, {
        floor_plan_pin_x: f.x,
        floor_plan_pin_y: f.y,
      })
      setItems((s) =>
        s.map((it) =>
          it.id === selectedItem
            ? { ...it, floor_plan_pin_x: f.x, floor_plan_pin_y: f.y }
            : it,
        ),
      )
      setSelectedItem(null)
      setMode('idle')
      toast.success('Item placed')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLImageElement>) => {
    if (mode !== 'draw') return
    const f = fractionFromEvent(e)
    if (!f) return
    setDrag({ startX: f.x, startY: f.y, endX: f.x, endY: f.y })
  }
  const handleMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
    if (mode !== 'draw' || !drag) return
    const f = fractionFromEvent(e)
    if (!f) return
    setDrag({ ...drag, endX: f.x, endY: f.y })
  }
  const handleMouseUp = () => {
    if (mode !== 'draw' || !drag) return
    // Ignore tiny drags (treat as click).
    const w = Math.abs(drag.endX - drag.startX)
    const h = Math.abs(drag.endY - drag.startY)
    if (w < 0.02 || h < 0.02) {
      setDrag(null)
      return
    }
    setNaming(drag)
    setDrag(null)
  }

  const cancelDraw = () => {
    setDrag(null)
    setMode('idle')
  }

  const removePin = async (itemId: string) => {
    if (!confirm('Remove this item from the floor plan?')) return
    try {
      await api.patch(`/api/projects/${projectId}/items/${itemId}`, {
        floor_plan_pin_x: null,
        floor_plan_pin_y: null,
      })
      setItems((s) =>
        s.map((it) =>
          it.id === itemId
            ? { ...it, floor_plan_pin_x: null, floor_plan_pin_y: null }
            : it,
        ),
      )
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (!project) return <PageSpinner />

  if (!project.floor_plan_url) {
    return (
      <>
        <EmptyState
          title="No floor plan uploaded"
          body="Upload a JPG, PNG, or PDF of the floor plan. Then drop items onto rooms to build a visual specification."
          action={
            <Button variant="primary" onClick={() => setOpenUpload(true)}>
              Upload floor plan
            </Button>
          }
        />
        <UploadFloorPlanModal
          projectId={projectId}
          open={openUpload}
          onClose={() => setOpenUpload(false)}
          onUploaded={() => {
            setOpenUpload(false)
            load()
          }}
        />
      </>
    )
  }

  const placedItems = items.filter(
    (it) => it.floor_plan_pin_x != null && it.floor_plan_pin_y != null,
  )
  const unplacedItems = items.filter(
    (it) => it.floor_plan_pin_x == null || it.floor_plan_pin_y == null,
  )

  // Compute the displayed drag rectangle in % units.
  const dragBox = drag
    ? {
        left: Math.min(drag.startX, drag.endX) * 100,
        top: Math.min(drag.startY, drag.endY) * 100,
        width: Math.abs(drag.endX - drag.startX) * 100,
        height: Math.abs(drag.endY - drag.startY) * 100,
      }
    : null

  return (
    <div className="grid md:grid-cols-[1fr_300px] gap-6">
      <div className="border border-hm-text/10 relative bg-hm-text/[0.02]">
        <div className="relative select-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={project.floor_plan_url}
            alt="Floor plan"
            draggable={false}
            className={[
              'w-full h-auto block',
              mode === 'place'
                ? 'cursor-crosshair'
                : mode === 'draw'
                ? 'cursor-crosshair'
                : 'cursor-default',
            ].join(' ')}
            onClick={handleClick}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => drag && setDrag(null)}
          />

          {/* Existing rooms overlay */}
          {rooms
            .filter(
              (r) =>
                r.floor_plan_x != null &&
                r.floor_plan_y != null &&
                r.floor_plan_width != null &&
                r.floor_plan_height != null,
            )
            .map((r) => (
              <div
                key={r.id}
                className="absolute border-2 border-hm-text/30 bg-hm-text/5 pointer-events-none"
                style={{
                  left: `${(r.floor_plan_x ?? 0) * 100}%`,
                  top: `${(r.floor_plan_y ?? 0) * 100}%`,
                  width: `${(r.floor_plan_width ?? 0) * 100}%`,
                  height: `${(r.floor_plan_height ?? 0) * 100}%`,
                }}
              >
                <div className="absolute top-1 left-2 font-sans text-[10px] uppercase tracking-[0.18em] text-hm-text bg-bg/80 px-1.5">
                  {r.name}
                </div>
              </div>
            ))}

          {/* Item pins */}
          {placedItems.map((it) => (
            <button
              key={it.id}
              onClick={(e) => {
                e.stopPropagation()
                removePin(it.id)
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 group"
              style={{
                left: `${(it.floor_plan_pin_x ?? 0) * 100}%`,
                top: `${(it.floor_plan_pin_y ?? 0) * 100}%`,
              }}
              title="Click to remove from floor plan"
            >
              <div
                className="w-3 h-3 rounded-full ring-2 ring-bg shadow"
                style={{ background: PIN_COLOR[it.status] ?? '#9ca3af' }}
              />
              <div className="absolute left-4 top-1/2 -translate-y-1/2 hidden group-hover:block bg-bg border border-hm-text/15 px-2 py-1 font-sans text-[10px] uppercase tracking-[0.18em] whitespace-nowrap shadow-sm">
                {it.name}
              </div>
            </button>
          ))}

          {/* Live drag rectangle */}
          {dragBox ? (
            <div
              className="absolute border-2 border-dashed border-hm-text/60 bg-hm-text/10 pointer-events-none"
              style={{
                left: `${dragBox.left}%`,
                top: `${dragBox.top}%`,
                width: `${dragBox.width}%`,
                height: `${dragBox.height}%`,
              }}
            />
          ) : null}
        </div>
      </div>

      <aside className="space-y-4">
        <div className="space-y-2">
          <Button
            variant={mode === 'draw' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => {
              setSelectedItem(null)
              setMode((m) => (m === 'draw' ? 'idle' : 'draw'))
            }}
            className="w-full"
          >
            {mode === 'draw' ? 'Cancel — drag to draw' : 'Draw a room'}
          </Button>
          <ManageRoomsButton
            projectId={projectId}
            rooms={rooms}
            onChange={load}
          />
        </div>

        <div className="pt-3 border-t border-hm-text/10">
          <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-2">
            Place an item
          </div>
          <div className="space-y-1 max-h-[40vh] overflow-y-auto">
            {unplacedItems.length === 0 ? (
              <div className="font-garamond text-[0.9rem] text-hm-nav py-3">
                Every item is placed.
              </div>
            ) : (
              unplacedItems.map((it) => (
                <button
                  key={it.id}
                  onClick={() => {
                    setSelectedItem(it.id)
                    setMode('place')
                  }}
                  className={[
                    'w-full text-left flex items-center gap-2 px-2 py-2 border transition-colors',
                    selectedItem === it.id
                      ? 'border-hm-text bg-hm-text/[0.06]'
                      : 'border-hm-text/10 hover:bg-hm-text/[0.03]',
                  ].join(' ')}
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: PIN_COLOR[it.status] ?? '#9ca3af' }}
                  />
                  <div className="font-garamond text-[0.95rem] truncate">
                    {it.name}
                  </div>
                </button>
              ))
            )}
          </div>
          {mode === 'place' ? (
            <div className="mt-3 font-garamond text-[0.85rem] text-hm-nav">
              Click anywhere on the floor plan to drop the pin.
            </div>
          ) : null}
        </div>

        <div className="pt-4 border-t border-hm-text/10">
          <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-2">
            Legend
          </div>
          <div className="space-y-1.5">
            {Object.entries(PIN_COLOR).map(([s, c]) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: c }}
                />
                <div className="font-garamond text-[0.9rem] text-hm-nav">
                  {titleCase(s)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-hm-text/10">
          <Button variant="ghost" size="sm" onClick={() => setOpenUpload(true)}>
            Replace floor plan
          </Button>
        </div>
      </aside>

      {drag ? (
        <button
          onClick={cancelDraw}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 font-sans text-[10px] uppercase tracking-[0.2em] bg-hm-text text-bg px-4 py-2 rounded-full"
        >
          Drag to define room — click to cancel
        </button>
      ) : null}

      <NameRoomModal
        rect={naming}
        projectId={projectId}
        existingCount={rooms.length}
        onClose={() => setNaming(null)}
        onCreated={() => {
          setNaming(null)
          setMode('idle')
          load()
        }}
      />

      <UploadFloorPlanModal
        projectId={projectId}
        open={openUpload}
        onClose={() => setOpenUpload(false)}
        onUploaded={() => {
          setOpenUpload(false)
          load()
        }}
      />
    </div>
  )
}

function NameRoomModal({
  rect,
  projectId,
  existingCount,
  onClose,
  onCreated,
}: {
  rect: DragRect | null
  projectId: string
  existingCount: number
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (rect) setName('')
  }, [rect])

  if (!rect) return null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    try {
      const x = Math.min(rect.startX, rect.endX)
      const y = Math.min(rect.startY, rect.endY)
      const w = Math.abs(rect.endX - rect.startX)
      const h = Math.abs(rect.endY - rect.startY)
      await api.post(`/api/projects/${projectId}/rooms`, {
        name: name.trim(),
        floor_plan_x: x,
        floor_plan_y: y,
        floor_plan_width: w,
        floor_plan_height: h,
        position: existingCount,
      })
      onCreated()
      toast.success('Room added')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={rect !== null} onClose={onClose} title="Name the room">
      <form onSubmit={submit}>
        <Field label="Room name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Living Room"
            required
            autoFocus
          />
        </Field>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting}>
            Create room
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function UploadFloorPlanModal({
  projectId,
  open,
  onClose,
  onUploaded,
}: {
  projectId: string
  open: boolean
  onClose: () => void
  onUploaded: () => void
}) {
  // V1 takes a URL — Supabase Storage upload UI is a TODO once a bucket
  // exists. Lets the FE be functional without storage wired.
  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await api.patch(`/api/projects/${projectId}`, {
        floor_plan_url: url.trim(),
      })
      onUploaded()
      toast.success('Floor plan saved')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Floor plan">
      <form onSubmit={submit}>
        <Field
          label="Floor plan URL"
          hint="Paste a public image URL. Direct upload via Supabase Storage is coming."
        >
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            placeholder="https://…"
          />
        </Field>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  )
}
