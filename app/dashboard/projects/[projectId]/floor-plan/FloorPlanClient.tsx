'use client'

// Floor plan tab.
//
// Single coordinate system: every position (rooms, pins, in-progress drag)
// is a 0..1 fraction of the visible media element's CSS box. We measure
// clicks against the same `<div ref={mediaRef}>` that wraps the image,
// and we render every overlay as an absolutely-positioned `<div>` inside
// that same wrapper using `left/top: ${pct}%`. No SVG overlay, no
// aspect-ratio juggling — what you click on is what gets stored, and
// what gets stored is what gets rendered.
//
// Rooms are rectangles with {floor_plan_x, _y, _width, _height} (0..1).
// Legacy polygon rooms render as their bounding box so they don't
// disappear; new rooms are always rectangles. The polygon column stays
// in the DB but the UI no longer writes to it.
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/lib/api'
import Spinner, { PageSpinner } from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { ManageRoomsButton } from '@/components/ui/RoomManager'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { toast } from '@/components/ui/Toast'
import { titleCase } from '@/lib/format'
import type { Project, Room, Item } from '@/lib/types-ui'

// Earthy palette — mirrors the on-page Badge tones in components/ui/Badge.tsx.
const PIN_COLOR: Record<string, string> = {
  sourcing: '#8a8e9c', // ink-subtle
  approved: '#b8843e', // warn (burnt mustard)
  ordered:  '#5b6e4a', // success (sage)
  received: '#8b3a2e', // accent (terracotta)
  installed: '#8b3a2e',
}

type Mode = 'idle' | 'place' | 'draw'

interface RectDrag {
  startX: number
  startY: number
  endX: number
  endY: number
}

interface PinDrag {
  itemId: string
  x: number
  y: number
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

// Resolve a room (rectangle or legacy polygon) to a single bounding rect
// in 0..1 image-fraction coords. Returns null if neither field is set.
function roomRect(r: Room): Rect | null {
  if (
    r.floor_plan_x != null &&
    r.floor_plan_y != null &&
    r.floor_plan_width != null &&
    r.floor_plan_height != null
  ) {
    return {
      x: r.floor_plan_x,
      y: r.floor_plan_y,
      w: r.floor_plan_width,
      h: r.floor_plan_height,
    }
  }
  if (r.floor_plan_polygon && r.floor_plan_polygon.length >= 3) {
    let minX = 1
    let minY = 1
    let maxX = 0
    let maxY = 0
    for (const p of r.floor_plan_polygon) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
  }
  return null
}

interface Props {
  projectId: string
  initialProject: Project
  initialItems: Item[]
  initialRooms: Room[]
}

export default function FloorPlanClient({
  projectId,
  initialProject,
  initialItems,
  initialRooms,
}: Props) {
  const confirm = useConfirm()
  const [project, setProject] = useState<Project | null>(initialProject)
  const [items, setItems] = useState<Item[]>(initialItems)
  const [rooms, setRooms] = useState<Room[]>(initialRooms)
  const [selectedItem, setSelectedItem] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('idle')

  // In-progress rectangle drag.
  const [rectDrag, setRectDrag] = useState<RectDrag | null>(null)
  const [naming, setNaming] = useState<Rect | null>(null)

  // In-progress pin drag.
  const [pinDrag, setPinDrag] = useState<PinDrag | null>(null)

  const [popover, setPopover] = useState<{ itemId: string; x: number; y: number } | null>(
    null,
  )

  const [openUpload, setOpenUpload] = useState(false)
  const [rotating, setRotating] = useState(false)
  // Click coords are measured against this wrapper, and every overlay is
  // an absolute child of it. The wrapper's height is established by the
  // image inside, so its bounds always match what the user is looking at.
  const mediaRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    const [p, i, r] = await Promise.all([
      api.get<Project>(`/api/projects/${projectId}`),
      api.get<Item[]>(`/api/projects/${projectId}/items`),
      api.get<Room[]>(`/api/projects/${projectId}/rooms`),
    ])
    const proj = p.data as Project
    setProject(proj)
    setItems((i.data as Item[]) ?? [])
    setRooms((r.data as Room[]) ?? [])
  }

  const fractionFromEvent = (e: { clientX: number; clientY: number }) => {
    const rect = mediaRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return null
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    }
  }

  const rotate = async () => {
    if (rotating) return
    setRotating(true)
    try {
      await api.post(`/api/projects/${projectId}/floor-plan/rotate`, {})
      // Refetch everything to local vars first; don't touch state until the
      // new image has decoded. Otherwise the room/pin coordinates flip onto
      // the old image while the new one is still in flight, which looks
      // jarring.
      const [p, i, r] = await Promise.all([
        api.get<Project>(`/api/projects/${projectId}`),
        api.get<Item[]>(`/api/projects/${projectId}/items`),
        api.get<Room[]>(`/api/projects/${projectId}/rooms`),
      ])
      const proj = p.data as Project
      const nextItems = (i.data as Item[]) ?? []
      const nextRooms = (r.data as Room[]) ?? []

      if (proj.floor_plan_url) {
        await new Promise<void>((resolve) => {
          const img = new window.Image()
          img.onload = () => resolve()
          img.onerror = () => resolve()
          img.src = proj.floor_plan_url!
        })
      }

      setProject(proj)
      setItems(nextItems)
      setRooms(nextRooms)
      toast.success('Rotated 90°')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setRotating(false)
    }
  }

  // Mousedown on the canvas (not on a pin):
  //   - place mode → drop pin and PATCH
  //   - draw mode  → start rectangle drag
  //   - idle       → no-op (popover closes via the explicit Close button)
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    const f = fractionFromEvent(e)
    if (!f) return

    if (mode === 'place' && selectedItem) {
      void (async () => {
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
        } catch (err) {
          toast.error((err as Error).message)
        }
      })()
      return
    }

    if (mode === 'draw') {
      setRectDrag({ startX: f.x, startY: f.y, endX: f.x, endY: f.y })
      return
    }

    // idle: clicking empty canvas dismisses the popover.
    setPopover(null)
  }

  const handleMove = (e: React.MouseEvent) => {
    const f = fractionFromEvent(e)
    if (!f) return
    if (pinDrag) {
      setPinDrag({ ...pinDrag, x: f.x, y: f.y })
    } else if (rectDrag) {
      setRectDrag({ ...rectDrag, endX: f.x, endY: f.y })
    }
  }

  const handleMouseUp = async () => {
    if (rectDrag) {
      const { startX, startY, endX, endY } = rectDrag
      setRectDrag(null)
      const w = Math.abs(endX - startX)
      const h = Math.abs(endY - startY)
      // Tiny drags are almost always accidental clicks, not rooms.
      if (w < 0.02 || h < 0.02) return
      setNaming({
        x: Math.min(startX, endX),
        y: Math.min(startY, endY),
        w,
        h,
      })
      return
    }
    if (!pinDrag) return
    const { itemId, x, y } = pinDrag
    const before = items.find((i) => i.id === itemId)
    setPinDrag(null)
    if (
      before &&
      Math.abs((before.floor_plan_pin_x ?? 0) - x) < 0.001 &&
      Math.abs((before.floor_plan_pin_y ?? 0) - y) < 0.001
    ) {
      return
    }
    try {
      await api.patch(`/api/projects/${projectId}/items/${itemId}`, {
        floor_plan_pin_x: x,
        floor_plan_pin_y: y,
      })
      setItems((s) =>
        s.map((it) =>
          it.id === itemId
            ? { ...it, floor_plan_pin_x: x, floor_plan_pin_y: y }
            : it,
        ),
      )
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const startPinDrag = (e: React.MouseEvent, itemId: string) => {
    if (mode !== 'idle') return
    e.preventDefault()
    e.stopPropagation()
    const it = items.find((i) => i.id === itemId)
    if (!it) return
    setPinDrag({
      itemId,
      x: it.floor_plan_pin_x ?? 0,
      y: it.floor_plan_pin_y ?? 0,
    })
  }

  const cancelDraw = () => {
    setRectDrag(null)
    setMode('idle')
  }

  useEffect(() => {
    if (mode !== 'draw') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelDraw()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode])

  const removePin = async (itemId: string) => {
    setPopover(null)
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

  const placedItems = useMemo(
    () =>
      items.filter(
        (it) => it.floor_plan_pin_x != null && it.floor_plan_pin_y != null,
      ),
    [items],
  )
  const unplacedItems = useMemo(
    () =>
      items.filter(
        (it) => it.floor_plan_pin_x == null || it.floor_plan_pin_y == null,
      ),
    [items],
  )

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

  const visibleRooms = rooms
    .map((r) => ({ room: r, rect: roomRect(r) }))
    .filter((x): x is { room: Room; rect: Rect } => x.rect != null)

  const cursor =
    mode === 'place' || mode === 'draw'
      ? 'cursor-crosshair'
      : pinDrag
      ? 'cursor-grabbing'
      : 'cursor-default'

  return (
    <div className="grid md:grid-cols-[1fr_300px] gap-6">
      <div
        className="border border-line relative select-none rounded"
        style={{
          // Dotted "drafting paper" grid — visible only at the edges around
          // the floor plan image. 24px spacing reads as graph paper without
          // competing with floor plan linework underneath.
          backgroundColor: 'var(--bg-elevated, #f3f1ea)',
          backgroundImage:
            'radial-gradient(circle, rgba(139,58,46,0.18) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          backgroundPosition: '0 0',
        }}
      >
        <div
          ref={mediaRef}
          className={[
            'relative transition-opacity duration-200',
            rotating ? 'opacity-40 pointer-events-none' : '',
          ].join(' ')}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            if (pinDrag) handleMouseUp()
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={project.floor_plan_url}
            alt="Floor plan"
            draggable={false}
            className={['w-full h-auto block', cursor].join(' ')}
          />


          {/* Existing rooms — pure CSS rectangles. */}
          {visibleRooms.map(({ room, rect }) => (
            <div
              key={room.id}
              className="absolute pointer-events-none border border-line-strong bg-ink/[0.06]"
              style={{
                left: `${rect.x * 100}%`,
                top: `${rect.y * 100}%`,
                width: `${rect.w * 100}%`,
                height: `${rect.h * 100}%`,
              }}
            >
              <div className="absolute top-1 left-2 font-sans text-[10px] uppercase tracking-[0.18em] text-ink bg-bg/80 px-1.5">
                {room.name}
              </div>
            </div>
          ))}

          {/* In-progress drag rect. */}
          {rectDrag ? (
            <div
              className="absolute pointer-events-none border border-dashed border-ink/70 bg-ink/[0.08]"
              style={{
                left: `${Math.min(rectDrag.startX, rectDrag.endX) * 100}%`,
                top: `${Math.min(rectDrag.startY, rectDrag.endY) * 100}%`,
                width: `${Math.abs(rectDrag.endX - rectDrag.startX) * 100}%`,
                height: `${Math.abs(rectDrag.endY - rectDrag.startY) * 100}%`,
              }}
            />
          ) : null}

          {/* Pins. */}
          {placedItems.map((it) => {
            const isDragging = pinDrag?.itemId === it.id
            const x =
              isDragging && pinDrag ? pinDrag.x : (it.floor_plan_pin_x ?? 0)
            const y =
              isDragging && pinDrag ? pinDrag.y : (it.floor_plan_pin_y ?? 0)
            return (
              <div
                key={it.id}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
              >
                <button
                  onMouseDown={(e) => startPinDrag(e, it.id)}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (mode !== 'idle') return
                    setPopover({ itemId: it.id, x, y })
                  }}
                  className={[
                    'w-3.5 h-3.5 rounded-full ring-2 ring-bg shadow transition-transform',
                    isDragging
                      ? 'scale-125 cursor-grabbing'
                      : 'cursor-grab hover:scale-110',
                  ].join(' ')}
                  style={{ background: PIN_COLOR[it.status] ?? '#9ca3af' }}
                  aria-label={`Item ${it.name}`}
                  title={it.name}
                />
              </div>
            )
          })}

          {/* Pin popover. */}
          {popover
            ? (() => {
                const it = items.find((i) => i.id === popover.itemId)
                if (!it) return null
                return (
                  <div
                    className="absolute -translate-y-full -translate-x-1/2 bg-bg border border-line px-3 py-2 shadow-lg z-10 min-w-[180px]"
                    style={{
                      left: `${popover.x * 100}%`,
                      top: `calc(${popover.y * 100}% - 14px)`,
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <div className="font-serif text-[1rem] leading-tight mb-0.5">
                      {it.name}
                    </div>
                    <div className="font-sans text-[10px] uppercase tracking-[0.18em] text-ink-muted mb-2">
                      {titleCase(it.status)}
                      {it.vendor ? ` · ${it.vendor}` : ''}
                    </div>
                    <div className="flex gap-2 mt-1.5">
                      <button
                        onClick={() => removePin(it.id)}
                        className="font-sans text-[10px] uppercase tracking-[0.18em] text-danger hover:underline"
                      >
                        Remove pin
                      </button>
                      <button
                        onClick={() => setPopover(null)}
                        className="font-sans text-[10px] uppercase tracking-[0.18em] text-ink-muted hover:text-ink ml-auto"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )
              })()
            : null}
        </div>

        {rotating ? (
          <div className="absolute inset-0 flex items-center justify-center bg-bg/30 backdrop-blur-[1px] pointer-events-none">
            <div className="flex items-center gap-3 bg-bg border border-line px-4 py-2.5 shadow-sm">
              <Spinner size={16} />
              <span className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted">
                Rotating
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <aside className="space-y-4">
        <div className="space-y-2">
          {mode === 'draw' ? (
            <div className="border border-line bg-ink/[0.02] px-3 py-3">
              <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted mb-1.5">
                Draw a room
              </div>
              <div className="font-garamond text-[0.9rem] leading-[1.6] text-ink-muted mb-3">
                Click and drag on the floor plan to define the room. Release
                to name it. <KeyHint>Esc</KeyHint> cancels.
              </div>
              <Button variant="ghost" size="sm" onClick={cancelDraw} className="w-full">
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSelectedItem(null)
                setMode('draw')
              }}
              className="w-full"
            >
              Draw a room
            </Button>
          )}
          <ManageRoomsButton
            projectId={projectId}
            rooms={rooms}
            onChange={load}
          />
        </div>

        <div className="pt-3 border-t border-line">
          <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted mb-2">
            Place an item
          </div>
          <div className="space-y-1 max-h-[40vh] overflow-y-auto">
            {unplacedItems.length === 0 ? (
              <div className="font-garamond text-[0.9rem] text-ink-muted py-3">
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
                      ? 'border-ink bg-ink/[0.06]'
                      : 'border-line hover:bg-ink/[0.03]',
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
            <div className="mt-3 font-garamond text-[0.85rem] text-ink-muted">
              Click anywhere on the floor plan to drop the pin.
            </div>
          ) : null}
        </div>

        <div className="pt-4 border-t border-line">
          <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted mb-2">
            Pins
          </div>
          <div className="font-garamond text-[0.85rem] text-ink-muted leading-[1.7]">
            Drag a pin to move it. Click for options.
          </div>
        </div>

        <div className="pt-4 border-t border-line">
          <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted mb-2">
            Image
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={rotate}
            loading={rotating}
          >
            Rotate 90°
          </Button>
          <div className="font-garamond text-[0.85rem] text-ink-muted leading-[1.55] mt-2">
            Rotates the image clockwise. Rooms and item pins move with it.
          </div>
        </div>

        <div className="pt-4 border-t border-line">
          <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted mb-2">
            Legend
          </div>
          <div className="space-y-1.5">
            {Object.entries(PIN_COLOR).map(([s, c]) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: c }}
                />
                <div className="font-garamond text-[0.9rem] text-ink-muted">
                  {titleCase(s)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-line flex flex-col items-start gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpenUpload(true)}>
            Replace floor plan
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              const ok = await confirm({
                title: 'Remove the floor plan?',
                body: 'Room shapes and pin positions stay on the project but will not be visible until a new plan is uploaded.',
                confirmLabel: 'Remove',
                tone: 'danger',
              })
              if (!ok) return
              try {
                await api.patch(`/api/projects/${projectId}`, { floor_plan_url: null })
                toast.success('Floor plan removed')
                load()
              } catch (e) {
                toast.error((e as Error).message)
              }
            }}
            className="text-danger hover:text-danger"
          >
            Remove floor plan
          </Button>
        </div>
      </aside>

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

function KeyHint({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-block font-sans text-[10px] uppercase tracking-[0.16em] border border-line-strong rounded-sm px-1.5 py-0.5 mx-0.5 bg-bg">
      {children}
    </kbd>
  )
}

function NameRoomModal({
  rect,
  projectId,
  existingCount,
  onClose,
  onCreated,
}: {
  rect: Rect | null
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
      await api.post(`/api/projects/${projectId}/rooms`, {
        name: name.trim(),
        floor_plan_x: rect.x,
        floor_plan_y: rect.y,
        floor_plan_width: rect.w,
        floor_plan_height: rect.h,
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
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      setFile(null)
      setDragging(false)
    }
  }, [open])

  const upload = async () => {
    if (!file) return
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.set('file', file)
      fd.set('kind', 'floor-plan')
      const res = await fetch(`/api/projects/${projectId}/uploads`, {
        method: 'POST',
        body: fd,
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error?.message ?? `Upload failed (${res.status})`)
      const path = body?.data?.path as string | undefined
      if (!path) throw new Error('Upload succeeded but no path was returned')
      const straightened = body?.data?.straightened === true
      // Persist the storage path; PATCH response signs it for display.
      await api.patch(`/api/projects/${projectId}`, { floor_plan_url: path })
      onUploaded()
      toast.success(
        straightened
          ? 'Floor plan uploaded · auto-straightened'
          : 'Floor plan uploaded',
      )
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Upload floor plan">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const f = e.dataTransfer.files?.[0]
          if (f) setFile(f)
        }}
        onClick={() => inputRef.current?.click()}
        className={[
          'border-2 border-dashed cursor-pointer p-10 text-center transition-colors',
          dragging
            ? 'border-ink bg-ink/[0.04]'
            : 'border-line-strong hover:border-ink/50',
        ].join(' ')}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) setFile(f)
          }}
        />
        {file ? (
          <div>
            <div className="font-serif text-[1.1rem]">{file.name}</div>
            <div className="font-garamond text-[0.9rem] text-ink-muted mt-1">
              {(file.size / 1024 / 1024).toFixed(1)} MB · {file.type || 'unknown type'}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setFile(null)
              }}
              className="mt-3 font-sans text-[10px] uppercase tracking-[0.18em] text-ink-muted hover:text-danger"
            >
              Choose a different file
            </button>
          </div>
        ) : (
          <>
            <div className="font-serif text-[1.1rem]">Drop a file here</div>
            <div className="font-garamond text-[0.9rem] text-ink-muted mt-1">
              or click to browse — JPG, PNG, WebP, SVG, PDF · max 25 MB
            </div>
          </>
        )}
      </div>

      <div className="flex justify-end gap-3 mt-5">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={upload}
          loading={submitting}
          disabled={!file}
        >
          Upload
        </Button>
      </div>
    </Modal>
  )
}
