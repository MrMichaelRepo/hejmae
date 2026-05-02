'use client'

// Floor plan tab. The image is a normal <img> with overlay pins. Coords are
// stored 0..1 (fraction of image width/height) so the layout stays correct
// across screen sizes. Drag-to-create-room is left as a TODO; for now,
// rooms are created via inline name input and pins are placed by clicking
// the image while an item is selected.
import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { PageSpinner } from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
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

export default function FloorPlanClient({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [selected, setSelected] = useState<string | null>(null)
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

  const placePin = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!selected || !imgRef.current) return
    const rect = imgRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    try {
      await api.patch(`/api/projects/${projectId}/items/${selected}`, {
        floor_plan_pin_x: x,
        floor_plan_pin_y: y,
      })
      setItems((s) =>
        s.map((it) =>
          it.id === selected ? { ...it, floor_plan_pin_x: x, floor_plan_pin_y: y } : it,
        ),
      )
      setSelected(null)
      toast.success('Item placed')
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

  return (
    <div className="grid md:grid-cols-[1fr_280px] gap-6">
      <div className="border border-hm-text/10 relative bg-hm-text/[0.02]">
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={project.floor_plan_url}
            alt="Floor plan"
            className={[
              'w-full h-auto block',
              selected ? 'cursor-crosshair' : '',
            ].join(' ')}
            onClick={placePin}
          />
          {placedItems.map((it) => (
            <div
              key={it.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 group"
              style={{
                left: `${(it.floor_plan_pin_x ?? 0) * 100}%`,
                top: `${(it.floor_plan_pin_y ?? 0) * 100}%`,
              }}
            >
              <div
                className="w-3 h-3 rounded-full ring-2 ring-bg shadow"
                style={{ background: PIN_COLOR[it.status] ?? '#9ca3af' }}
              />
              <div className="absolute left-4 top-1/2 -translate-y-1/2 hidden group-hover:block bg-bg border border-hm-text/15 px-2 py-1 font-sans text-[10px] uppercase tracking-[0.18em] whitespace-nowrap shadow-sm">
                {it.name}
              </div>
            </div>
          ))}
        </div>
      </div>

      <aside className="space-y-4">
        <div>
          <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-2">
            Place an item
          </div>
          <div className="space-y-1 max-h-[60vh] overflow-y-auto">
            {unplacedItems.length === 0 ? (
              <div className="font-garamond text-[0.9rem] text-hm-nav py-3">
                Every item is placed.
              </div>
            ) : (
              unplacedItems.map((it) => (
                <button
                  key={it.id}
                  onClick={() => setSelected(it.id)}
                  className={[
                    'w-full text-left flex items-center gap-2 px-2 py-2 border transition-colors',
                    selected === it.id
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
          {selected ? (
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpenUpload(true)}
          >
            Replace floor plan
          </Button>
        </div>

        <div className="pt-4 border-t border-hm-text/10">
          <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-2">
            Rooms ({rooms.length})
          </div>
          {rooms.length === 0 ? (
            <div className="font-garamond text-[0.9rem] text-hm-nav">
              Rooms can be created from the Items tab. Drag-to-define-on-image
              coming soon.
            </div>
          ) : (
            <ul className="font-garamond text-[0.95rem] text-hm-nav space-y-0.5">
              {rooms.map((r) => (
                <li key={r.id}>{r.name}</li>
              ))}
            </ul>
          )}
        </div>
      </aside>

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
      await api.patch(`/api/projects/${projectId}`, { floor_plan_url: url.trim() })
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
