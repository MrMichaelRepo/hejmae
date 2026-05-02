'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { formatCents, formatDate } from '@/lib/format'
import { PageSpinner } from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'
import { Field } from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { StatusBadge } from '@/components/ui/Badge'
import { toast } from '@/components/ui/Toast'
import type { Proposal, ProposalRoom, Room, Item } from '@/lib/types-ui'

interface ProposalWithRooms extends Proposal {
  proposal_rooms?: ProposalRoom[]
}

export default function ProposalClient({ projectId }: { projectId: string }) {
  const [proposals, setProposals] = useState<ProposalWithRooms[] | null>(null)
  const [rooms, setRooms] = useState<Room[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [openCreate, setOpenCreate] = useState(false)

  const load = async () => {
    const [p, r, i] = await Promise.all([
      api.get<ProposalWithRooms[]>(`/api/projects/${projectId}/proposals`),
      api.get<Room[]>(`/api/projects/${projectId}/rooms`),
      api.get<Item[]>(`/api/projects/${projectId}/items`),
    ])
    setProposals((p.data as ProposalWithRooms[]) ?? [])
    setRooms((r.data as Room[]) ?? [])
    setItems((i.data as Item[]) ?? [])
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const send = async (proposalId: string) => {
    try {
      const res = await api.post<Proposal>(
        `/api/projects/${projectId}/proposals/${proposalId}/send`,
      )
      const url = (res as { magic_link_url?: string }).magic_link_url
      if (url) {
        navigator.clipboard.writeText(url)
        toast.success('Proposal sent — link copied to clipboard')
      } else {
        toast.success('Proposal sent')
      }
      load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (proposals === null) return <PageSpinner />

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav">
          Proposals ({proposals.length})
        </div>
        <Button variant="primary" onClick={() => setOpenCreate(true)} disabled={rooms.length === 0}>
          + Build proposal
        </Button>
      </div>

      {rooms.length === 0 ? (
        <EmptyState
          title="Add rooms first"
          body="Proposals are organized by room. Create rooms (and assign items to them) before building a proposal."
          small
        />
      ) : proposals.length === 0 ? (
        <EmptyState
          title="No proposals yet"
          body="Build a proposal to send your client a visual, room-by-room presentation. Clients approve per room — no account required."
          action={
            <Button variant="primary" onClick={() => setOpenCreate(true)}>
              Build first proposal
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {proposals.map((p) => {
            const proposalRooms = p.proposal_rooms ?? []
            const roomTotals = proposalRooms.map((pr) => {
              const ri = items.filter((it) => it.room_id === pr.room_id)
              const total = ri.reduce(
                (a, it) => a + it.client_price_cents * it.quantity,
                0,
              )
              return { pr, total, items: ri, room: rooms.find((r) => r.id === pr.room_id) }
            })
            const grand = roomTotals.reduce((a, r) => a + r.total, 0)
            return (
              <div key={p.id} className="border border-hm-text/10">
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-hm-text/10 bg-hm-text/[0.02]">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-serif text-[1.1rem]">
                      Proposal · {formatDate(p.created_at)}
                    </span>
                    <StatusBadge kind="proposal" status={p.status} />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-garamond text-[0.95rem] text-hm-nav">
                      {formatCents(grand)}
                    </span>
                    {p.status === 'draft' ? (
                      <Button size="sm" variant="primary" onClick={() => send(p.id)}>
                        Send
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => send(p.id)}>
                        Resend
                      </Button>
                    )}
                  </div>
                </div>
                <div className="divide-y divide-hm-text/10">
                  {roomTotals.map(({ pr, total, items: ri, room }) => (
                    <div key={pr.id} className="px-5 py-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="font-serif text-[1.05rem]">
                          {room?.name ?? 'Room'}
                        </div>
                        <div className="flex items-center gap-3">
                          {pr.approved_at ? (
                            <span className="font-sans text-[10px] uppercase tracking-[0.2em] text-emerald-800">
                              Approved {formatDate(pr.approved_at)}
                            </span>
                          ) : null}
                          <span className="font-garamond text-[0.95rem] text-hm-nav">
                            {formatCents(total)}
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {ri.length === 0 ? (
                          <div className="col-span-full font-garamond text-[0.9rem] text-hm-nav">
                            No items in this room yet.
                          </div>
                        ) : (
                          ri.map((it) => (
                            <div
                              key={it.id}
                              className="border border-hm-text/10 p-2"
                            >
                              <div className="aspect-square bg-hm-text/[0.05] mb-2">
                                {it.image_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={it.image_url}
                                    alt=""
                                    className="w-full h-full object-cover"
                                  />
                                ) : null}
                              </div>
                              <div className="font-garamond text-[0.85rem] leading-tight truncate">
                                {it.name}
                              </div>
                              <div className="font-sans text-[10px] text-hm-nav uppercase tracking-[0.18em] mt-1">
                                {formatCents(it.client_price_cents)}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      {pr.client_comment ? (
                        <div className="mt-3 font-garamond text-[0.9rem] text-hm-nav italic border-l-2 border-hm-text/15 pl-3">
                          “{pr.client_comment}”
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <CreateProposalModal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        projectId={projectId}
        rooms={rooms}
        onCreated={() => {
          setOpenCreate(false)
          load()
          toast.success('Proposal drafted')
        }}
      />
    </div>
  )
}

function CreateProposalModal({
  open,
  onClose,
  projectId,
  rooms,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  projectId: string
  rooms: Room[]
  onCreated: () => void
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) setPicked(new Set(rooms.map((r) => r.id)))
  }, [open, rooms])

  const submit = async () => {
    if (picked.size === 0) return
    setSubmitting(true)
    try {
      await api.post(`/api/projects/${projectId}/proposals`, {
        room_ids: Array.from(picked),
      })
      onCreated()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Build proposal">
      <Field label="Rooms to include">
        <div className="space-y-2">
          {rooms.map((r) => (
            <label
              key={r.id}
              className="flex items-center gap-3 px-3 py-2 border border-hm-text/10 cursor-pointer hover:bg-hm-text/[0.03] transition-colors"
            >
              <input
                type="checkbox"
                checked={picked.has(r.id)}
                onChange={(e) => {
                  setPicked((s) => {
                    const next = new Set(s)
                    if (e.target.checked) next.add(r.id)
                    else next.delete(r.id)
                    return next
                  })
                }}
              />
              <span className="font-garamond text-[1rem]">{r.name}</span>
            </label>
          ))}
        </div>
      </Field>

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={submit}
          loading={submitting}
          disabled={picked.size === 0}
        >
          Create draft
        </Button>
      </div>
    </Modal>
  )
}
