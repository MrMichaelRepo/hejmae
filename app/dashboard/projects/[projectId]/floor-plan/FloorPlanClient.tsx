'use client'

// Floor plan tab.
//
// Coords are stored 0..1 (fractions of image width/height) so the layout
// stays correct across screen sizes. An overlay <svg viewBox="0 0 1 1">
// sits on top of the floor-plan image — its own coordinate system is also
// 0..1, so we can render polygons + lines directly without per-resize math.
//
// Three interaction modes:
//   - 'idle'   — pins are draggable; clicking on canvas does nothing
//   - 'place'  — click on canvas drops the selected (unplaced) item
//   - 'draw'   — click to add polygon points; close to commit a new room
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { PageSpinner } from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { ManageRoomsButton } from '@/components/ui/RoomManager'
import { toast } from '@/components/ui/Toast'
import { titleCase } from '@/lib/format'
import type { Project, Room, Item, PolygonPoint } from '@/lib/types-ui'

const PIN_COLOR: Record<string, string> = {
  sourcing: '#9ca3af',
  approved: '#b45309',
  ordered: '#15803d',
  received: '#0369a1',
  installed: '#0369a1',
}

type Mode = 'idle' | 'place' | 'draw'

// While dragging a placed pin, we hold the in-flight position locally so the
// PATCH only fires on mouseup. Avoids a request per move.
interface PinDrag {
  itemId: string
  x: number
  y: number
}

// Returns 4-point polygon for legacy rectangle rooms so we can render them
// uniformly with the new polygon system.
function rectToPolygon(r: Room): PolygonPoint[] | null {
  if (
    r.floor_plan_x == null ||
    r.floor_plan_y == null ||
    r.floor_plan_width == null ||
    r.floor_plan_height == null
  )
    return null
  const x = r.floor_plan_x
  const y = r.floor_plan_y
  const w = r.floor_plan_width
  const h = r.floor_plan_height
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ]
}

function roomPolygon(r: Room): PolygonPoint[] | null {
  if (r.floor_plan_polygon && r.floor_plan_polygon.length >= 3)
    return r.floor_plan_polygon
  return rectToPolygon(r)
}

function polygonCentroid(pts: PolygonPoint[]): PolygonPoint {
  // Simple centroid (good enough for label placement).
  let sx = 0
  let sy = 0
  for (const p of pts) {
    sx += p.x
    sy += p.y
  }
  return { x: sx / pts.length, y: sy / pts.length }
}

export default function FloorPlanClient({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [selectedItem, setSelectedItem] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('idle')

  // In-progress polygon (draw mode).
  const [drawPts, setDrawPts] = useState<PolygonPoint[]>([])
  const [hover, setHover] = useState<PolygonPoint | null>(null)
  const [naming, setNaming] = useState<PolygonPoint[] | null>(null)

  // In-progress pin drag (idle mode).
  const [pinDrag, setPinDrag] = useState<PinDrag | null>(null)

  // Item info popover.
  const [popover, setPopover] = useState<{ itemId: string; x: number; y: number } | null>(
    null,
  )

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

  const fractionFromEvent = (e: { clientX: number; clientY: number }): PolygonPoint | null => {
    const rect = imgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return null
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    }
  }

  // ---- Click on canvas ----
  const handleCanvasClick = async (e: React.MouseEvent) => {
    const f = fractionFromEvent(e)
    if (!f) return

    if (mode === 'place' && selectedItem) {
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
      return
    }

    if (mode === 'draw') {
      // If clicking near the first point and we have ≥3 points, close.
      if (drawPts.length >= 3) {
        const first = drawPts[0]
        const dx = first.x - f.x
        const dy = first.y - f.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 0.025) {
          setNaming(drawPts)
          setDrawPts([])
          setHover(null)
          return
        }
      }
      setDrawPts((s) => [...s, f])
      return
    }

    // Idle: click empty space dismisses popover.
    setPopover(null)
  }

  // ---- Pin drag ----
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

  // Mouse move: update drag position OR draw-hover line.
  const handleMove = (e: React.MouseEvent) => {
    const f = fractionFromEvent(e)
    if (!f) return
    if (pinDrag) {
      setPinDrag({ ...pinDrag, x: f.x, y: f.y })
    } else if (mode === 'draw' && drawPts.length > 0) {
      setHover(f)
    }
  }

  // Mouse up: commit pin drag.
  const handleMouseUp = async () => {
    if (!pinDrag) return
    const { itemId, x, y } = pinDrag
    const before = items.find((i) => i.id === itemId)
    setPinDrag(null)
    // No-op if position barely changed.
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

  // Cancel/abort handlers
  const cancelDraw = () => {
    setDrawPts([])
    setHover(null)
    setMode('idle')
  }

  const undoLastPoint = () => {
    setDrawPts((s) => s.slice(0, -1))
  }

  const finishDraw = () => {
    if (drawPts.length < 3) {
      toast.error('Need at least 3 points')
      return
    }
    setNaming(drawPts)
    setDrawPts([])
    setHover(null)
  }

  // Keyboard: Escape cancels, Enter finishes, Backspace undoes a point.
  useEffect(() => {
    if (mode !== 'draw') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelDraw()
      else if (e.key === 'Enter') finishDraw()
      else if (e.key === 'Backspace') undoLastPoint()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, drawPts])

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

  // Polygons to render (existing rooms + in-progress draw).
  const renderableRooms = rooms
    .map((r) => ({ room: r, poly: roomPolygon(r) }))
    .filter((x): x is { room: Room; poly: PolygonPoint[] } => x.poly != null)

  return (
    <div className="grid md:grid-cols-[1fr_300px] gap-6">
      <div className="border border-hm-text/10 relative bg-hm-text/[0.02] select-none">
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={project.floor_plan_url}
            alt="Floor plan"
            draggable={false}
            className="w-full h-auto block"
            onMouseMove={handleMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => {
              if (pinDrag) handleMouseUp()
              if (mode === 'draw') setHover(null)
            }}
          />

          {/* Overlay SVG with viewBox 0..1 so we can render in fraction coords. */}
          <svg
            className={[
              'absolute inset-0 w-full h-full',
              mode === 'place' || mode === 'draw'
                ? 'cursor-crosshair'
                : pinDrag
                ? 'cursor-grabbing'
                : 'cursor-default',
            ].join(' ')}
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            onMouseMove={handleMove}
            onMouseUp={handleMouseUp}
            onClick={handleCanvasClick}
          >
            {/* Existing rooms */}
            {renderableRooms.map(({ room, poly }) => {
              const c = polygonCentroid(poly)
              return (
                <g key={room.id}>
                  <polygon
                    points={poly.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="rgba(30,33,40,0.06)"
                    stroke="rgba(30,33,40,0.35)"
                    strokeWidth={0.003}
                    vectorEffect="non-scaling-stroke"
                    style={{ pointerEvents: 'none' }}
                  />
                  {/* Label rendered as foreignObject so it uses real CSS */}
                  <foreignObject
                    x={c.x - 0.1}
                    y={c.y - 0.02}
                    width={0.2}
                    height={0.04}
                    style={{ pointerEvents: 'none', overflow: 'visible' }}
                  >
                    <div className="flex items-center justify-center w-full h-full">
                      <span className="font-sans text-[10px] uppercase tracking-[0.18em] text-hm-text bg-bg/80 px-1.5 py-0.5 whitespace-nowrap">
                        {room.name}
                      </span>
                    </div>
                  </foreignObject>
                </g>
              )
            })}

            {/* In-progress draw: previous points + closing line + ghost line */}
            {mode === 'draw' && drawPts.length > 0 ? (
              <g>
                {drawPts.length > 1 ? (
                  <polyline
                    points={drawPts.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="none"
                    stroke="rgba(30,33,40,0.7)"
                    strokeWidth={0.004}
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
                {hover ? (
                  <line
                    x1={drawPts[drawPts.length - 1].x}
                    y1={drawPts[drawPts.length - 1].y}
                    x2={hover.x}
                    y2={hover.y}
                    stroke="rgba(30,33,40,0.4)"
                    strokeWidth={0.004}
                    strokeDasharray="0.01,0.008"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
                {/* Closing hint when near first point */}
                {hover && drawPts.length >= 3
                  ? (() => {
                      const dx = drawPts[0].x - hover.x
                      const dy = drawPts[0].y - hover.y
                      const dist = Math.sqrt(dx * dx + dy * dy)
                      if (dist < 0.025) {
                        return (
                          <line
                            x1={hover.x}
                            y1={hover.y}
                            x2={drawPts[0].x}
                            y2={drawPts[0].y}
                            stroke="#0369a1"
                            strokeWidth={0.005}
                            vectorEffect="non-scaling-stroke"
                          />
                        )
                      }
                      return null
                    })()
                  : null}
                {/* Vertices */}
                {drawPts.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={0.006}
                    fill={i === 0 ? '#0369a1' : '#1e2128'}
                  />
                ))}
              </g>
            ) : null}
          </svg>

          {/* Placed item pins (positioned over the SVG so they can capture
              mousedown for drag). */}
          {placedItems.map((it) => {
            const isDragging = pinDrag?.itemId === it.id
            const x =
              isDragging && pinDrag
                ? pinDrag.x
                : (it.floor_plan_pin_x ?? 0)
            const y =
              isDragging && pinDrag
                ? pinDrag.y
                : (it.floor_plan_pin_y ?? 0)
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
                    setPopover({
                      itemId: it.id,
                      x,
                      y,
                    })
                  }}
                  className={[
                    'w-3.5 h-3.5 rounded-full ring-2 ring-bg shadow transition-transform',
                    isDragging ? 'scale-125 cursor-grabbing' : 'cursor-grab hover:scale-110',
                  ].join(' ')}
                  style={{ background: PIN_COLOR[it.status] ?? '#9ca3af' }}
                  aria-label={`Item ${it.name}`}
                  title={it.name}
                />
              </div>
            )
          })}

          {/* Item popover */}
          {popover
            ? (() => {
                const it = items.find((i) => i.id === popover.itemId)
                if (!it) return null
                return (
                  <div
                    className="absolute -translate-y-full -translate-x-1/2 bg-bg border border-hm-text/15 px-3 py-2 shadow-lg z-10 min-w-[180px]"
                    style={{
                      left: `${popover.x * 100}%`,
                      top: `calc(${popover.y * 100}% - 14px)`,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="font-serif text-[1rem] leading-tight mb-0.5">
                      {it.name}
                    </div>
                    <div className="font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav mb-2">
                      {titleCase(it.status)}
                      {it.vendor ? ` · ${it.vendor}` : ''}
                    </div>
                    <div className="flex gap-2 mt-1.5">
                      <button
                        onClick={() => removePin(it.id)}
                        className="font-sans text-[10px] uppercase tracking-[0.18em] text-red-700 hover:underline"
                      >
                        Remove pin
                      </button>
                      <button
                        onClick={() => setPopover(null)}
                        className="font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav hover:text-hm-text ml-auto"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )
              })()
            : null}
        </div>
      </div>

      <aside className="space-y-4">
        <div className="space-y-2">
          {mode === 'draw' ? (
            <>
              <div className="border border-sky-700/30 bg-sky-50/30 px-3 py-2 font-garamond text-[0.9rem] text-hm-text">
                Click to drop points. Click the first point or press Enter to
                close. Backspace undoes, Escape cancels.
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={undoLastPoint}
                  disabled={drawPts.length === 0}
                >
                  Undo
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={cancelDraw}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={finishDraw}
                  disabled={drawPts.length < 3}
                >
                  Finish
                </Button>
              </div>
            </>
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
            Pins
          </div>
          <div className="font-garamond text-[0.85rem] text-hm-nav leading-[1.7]">
            Drag a pin to move it. Click for options.
          </div>
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

      <NameRoomModal
        polygon={naming}
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
  polygon,
  projectId,
  existingCount,
  onClose,
  onCreated,
}: {
  polygon: PolygonPoint[] | null
  projectId: string
  existingCount: number
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (polygon) setName('')
  }, [polygon])

  if (!polygon) return null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    try {
      await api.post(`/api/projects/${projectId}/rooms`, {
        name: name.trim(),
        floor_plan_polygon: polygon,
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
    <Modal open={polygon !== null} onClose={onClose} title="Name the room">
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
      const url = body?.data?.publicUrl as string | undefined
      if (!url) throw new Error('Upload succeeded but no URL was returned')
      await api.patch(`/api/projects/${projectId}`, { floor_plan_url: url })
      onUploaded()
      toast.success('Floor plan uploaded')
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
            ? 'border-hm-text bg-hm-text/[0.04]'
            : 'border-hm-text/20 hover:border-hm-text/50',
        ].join(' ')}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/svg+xml,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) setFile(f)
          }}
        />
        {file ? (
          <div>
            <div className="font-serif text-[1.1rem]">{file.name}</div>
            <div className="font-garamond text-[0.9rem] text-hm-nav mt-1">
              {(file.size / 1024 / 1024).toFixed(1)} MB · {file.type || 'unknown type'}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setFile(null)
              }}
              className="mt-3 font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav hover:text-red-700"
            >
              Choose a different file
            </button>
          </div>
        ) : (
          <>
            <div className="font-serif text-[1.1rem]">Drop a file here</div>
            <div className="font-garamond text-[0.9rem] text-hm-nav mt-1">
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
