'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { formatCents, formatDate } from '@/lib/format'
import { PageSpinner } from '@/components/ui/Spinner'
import Button from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'
import { toast } from '@/components/ui/Toast'

// All shapes here are the SANITIZED portal payload — no trade pricing.
interface PortalProposalPayload {
  proposal: {
    id: string
    status: string
    sent_at: string | null
    client_notes: string | null
  }
  project: { id: string; name: string; location: string | null; floor_plan_url: string | null } | null
  designer: {
    studio_name: string | null
    name: string | null
    logo_url: string | null
    brand_color: string | null
  } | null
  rooms: Array<{
    proposal_room_id: string
    room_id: string
    position: number
    approved_at: string | null
    client_comment: string | null
    room: { id: string; name: string } | null
    items: Array<{
      id: string
      name: string
      vendor: string | null
      image_url: string | null
      retail_price_cents: number | null
      client_price_cents: number
      quantity: number
      status: string
    }>
  }>
}

export default function PortalProposal({ token }: { token: string }) {
  const [data, setData] = useState<PortalProposalPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    try {
      const r = await api.get<PortalProposalPayload>(
        `/api/portal/proposals/${token}`,
      )
      setData(r.data as PortalProposalPayload)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  if (error)
    return (
      <div className="max-w-md mx-auto pt-32 px-6 text-center">
        <h1 className="font-serif text-[2rem] mb-3">Link unavailable</h1>
        <p className="font-garamond text-[1rem] text-hm-nav">{error}</p>
      </div>
    )
  if (!data) return <PageSpinner />

  const grand = data.rooms.reduce(
    (a, r) =>
      a + r.items.reduce((b, it) => b + it.client_price_cents * it.quantity, 0),
    0,
  )

  const brand = data.designer?.brand_color ?? '#1e2128'

  return (
    <div className="max-w-4xl mx-auto px-6 md:px-10 py-10">
      <header
        className="border-b pb-6 mb-10 flex items-center justify-between"
        style={{ borderColor: `${brand}25` }}
      >
        <div className="flex items-center gap-4">
          {data.designer?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.designer.logo_url}
              alt=""
              className="h-10 w-auto"
            />
          ) : (
            <div
              className="font-sans text-[12px] font-bold uppercase tracking-[0.22em]"
              style={{ color: brand }}
            >
              {data.designer?.studio_name ?? 'Hejmae'}
            </div>
          )}
        </div>
        <div className="font-garamond text-[0.9rem] text-hm-nav">
          {data.proposal.sent_at ? formatDate(data.proposal.sent_at) : ''}
        </div>
      </header>

      <div className="mb-10">
        <div className="font-sans text-[10px] uppercase tracking-[0.26em] text-hm-nav mb-3">
          Proposal
        </div>
        <h1 className="font-serif text-[clamp(2rem,4vw,3rem)] leading-[1.05] tracking-[-0.015em]">
          {data.project?.name ?? 'Your project'}
        </h1>
        {data.project?.location ? (
          <div className="mt-2 font-garamond text-[1rem] text-hm-nav">
            {data.project.location}
          </div>
        ) : null}
        {data.proposal.client_notes ? (
          <p className="mt-5 font-garamond text-[1rem] leading-[1.7] text-hm-nav max-w-2xl whitespace-pre-wrap">
            {data.proposal.client_notes}
          </p>
        ) : null}
      </div>

      <div className="space-y-12">
        {data.rooms.map((r) => (
          <RoomSection
            key={r.proposal_room_id}
            room={r}
            token={token}
            brand={brand}
            onApproved={load}
          />
        ))}
      </div>

      <div
        className="mt-12 border-t pt-6 flex items-center justify-between"
        style={{ borderColor: `${brand}25` }}
      >
        <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav">
          Proposal total
        </div>
        <div className="font-serif text-[1.6rem]">{formatCents(grand)}</div>
      </div>

      <footer className="mt-10 text-center font-sans text-[10px] uppercase tracking-[0.2em] text-hm-nav/60">
        Prepared by {data.designer?.studio_name ?? data.designer?.name ?? 'your designer'}
      </footer>
    </div>
  )
}

function RoomSection({
  room,
  token,
  brand,
  onApproved,
}: {
  room: PortalProposalPayload['rooms'][number]
  token: string
  brand: string
  onApproved: () => void
}) {
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const total = room.items.reduce(
    (a, it) => a + it.client_price_cents * it.quantity,
    0,
  )

  const approve = async () => {
    setSubmitting(true)
    try {
      await api.post(
        `/api/portal/proposals/${token}/rooms/${room.room_id}/approve`,
        comment.trim() ? { client_comment: comment.trim() } : {},
      )
      toast.success('Approved — thank you')
      onApproved()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section>
      <div className="flex items-end justify-between mb-5">
        <h2 className="font-serif text-[1.6rem] leading-tight">
          {room.room?.name ?? 'Room'}
        </h2>
        <div className="font-garamond text-[1.05rem] text-hm-nav">
          {formatCents(total)}
        </div>
      </div>

      {room.items.length === 0 ? (
        <div className="font-garamond text-[0.95rem] text-hm-nav border border-dashed border-hm-text/15 p-6 text-center">
          No items in this room.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {room.items.map((it) => (
            <div key={it.id} className="border border-hm-text/10 p-3">
              <div className="aspect-square bg-hm-text/[0.05] mb-3">
                {it.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.image_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : null}
              </div>
              <div className="font-serif text-[1rem] leading-tight line-clamp-2">
                {it.name}
              </div>
              {it.vendor ? (
                <div className="font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav mt-1.5">
                  {it.vendor}
                </div>
              ) : null}
              <div className="font-garamond text-[0.95rem] text-hm-text mt-2">
                {formatCents(it.client_price_cents)}
                {it.quantity > 1 ? ` · qty ${it.quantity}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {room.approved_at ? (
        <div
          className="mt-5 px-4 py-3 rounded-sm border font-garamond text-[0.95rem]"
          style={{ borderColor: brand, color: brand }}
        >
          Approved {formatDate(room.approved_at)}
          {room.client_comment ? (
            <div className="mt-1 italic text-hm-nav">“{room.client_comment}”</div>
          ) : null}
        </div>
      ) : (
        <div className="mt-5 border border-hm-text/10 p-4">
          <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-3">
            Approve this room
          </div>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder="Optional comment for your designer…"
            className="mb-3"
          />
          <Button onClick={approve} variant="primary" loading={submitting}>
            Approve {room.room?.name ?? 'room'}
          </Button>
        </div>
      )}
    </section>
  )
}
