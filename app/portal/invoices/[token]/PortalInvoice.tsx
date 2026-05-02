'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { formatCents, formatDate } from '@/lib/format'
import { PageSpinner } from '@/components/ui/Spinner'
import Button from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'

interface PortalInvoicePayload {
  invoice: {
    id: string
    type: string
    status: string
    total_cents: number
    sent_at: string | null
    paid_at: string | null
    notes: string | null
  }
  project: { id: string; name: string; location: string | null } | null
  designer: {
    studio_name: string | null
    name: string | null
    logo_url: string | null
    brand_color: string | null
  } | null
  lines: Array<{
    id: string
    description: string
    quantity: number
    unit_price_cents: number
    total_price_cents: number
    position: number
  }>
}

export default function PortalInvoice({ token }: { token: string }) {
  const [data, setData] = useState<PortalInvoicePayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    api
      .get<PortalInvoicePayload>(`/api/portal/invoices/${token}`)
      .then((r) => setData(r.data as PortalInvoicePayload))
      .catch((e) => setError((e as Error).message))
  }, [token])

  const initiatePayment = async () => {
    setPaying(true)
    try {
      const res = await api.post<{
        client_secret: string
        connected_account_id: string
        payment_intent_id: string
      }>(`/api/portal/invoices/${token}/payment-intent`)
      // TODO: integrate Stripe.js with Elements (using
      // res.client_secret + stripeAccount: res.connected_account_id) to
      // collect the card and confirm. For now, surface the intent so the
      // designer/dev can verify the round-trip.
      toast.success('Payment intent created — Stripe.js wiring is the next step')
      void res
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setPaying(false)
    }
  }

  if (error)
    return (
      <div className="max-w-md mx-auto pt-32 px-6 text-center">
        <h1 className="font-serif text-[2rem] mb-3">Invoice unavailable</h1>
        <p className="font-garamond text-[1rem] text-hm-nav">{error}</p>
      </div>
    )
  if (!data) return <PageSpinner />

  const brand = data.designer?.brand_color ?? '#1e2128'
  const isPaid = data.invoice.status === 'paid'

  return (
    <div className="max-w-2xl mx-auto px-6 md:px-10 py-10">
      <header
        className="border-b pb-6 mb-10 flex items-center justify-between"
        style={{ borderColor: `${brand}25` }}
      >
        <div>
          {data.designer?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.designer.logo_url}
              alt=""
              className="h-10 w-auto mb-2"
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
        <div className="text-right">
          <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav">
            Invoice
          </div>
          <div className="font-garamond text-[0.95rem] text-hm-nav mt-1">
            {data.invoice.sent_at ? formatDate(data.invoice.sent_at) : ''}
          </div>
        </div>
      </header>

      <div className="mb-8">
        <h1 className="font-serif text-[2rem] leading-tight">
          {data.project?.name ?? 'Your project'}
        </h1>
        {data.project?.location ? (
          <div className="mt-1 font-garamond text-[1rem] text-hm-nav">
            {data.project.location}
          </div>
        ) : null}
        <div className="mt-3 font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav">
          {data.invoice.type} · {data.invoice.status}
        </div>
      </div>

      <table className="w-full font-garamond text-[1rem] mb-8 border-t border-hm-text/10">
        <thead>
          <tr className="font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav">
            <th className="text-left px-2 py-3">Description</th>
            <th className="text-right px-2 py-3 w-16">Qty</th>
            <th className="text-right px-2 py-3 w-28">Unit</th>
            <th className="text-right px-2 py-3 w-28">Total</th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((l) => (
            <tr key={l.id} className="border-t border-hm-text/10">
              <td className="px-2 py-3">{l.description}</td>
              <td className="text-right px-2 py-3 text-hm-nav">{l.quantity}</td>
              <td className="text-right px-2 py-3">
                {formatCents(l.unit_price_cents)}
              </td>
              <td className="text-right px-2 py-3">
                {formatCents(l.total_price_cents)}
              </td>
            </tr>
          ))}
          <tr className="border-t-2" style={{ borderColor: brand }}>
            <td className="px-2 py-4 font-sans text-[10px] uppercase tracking-[0.22em]" colSpan={3}>
              Total due
            </td>
            <td className="text-right px-2 py-4 font-serif text-[1.4rem]">
              {formatCents(data.invoice.total_cents)}
            </td>
          </tr>
        </tbody>
      </table>

      {data.invoice.notes ? (
        <p className="font-garamond text-[0.95rem] text-hm-nav mb-8 whitespace-pre-wrap">
          {data.invoice.notes}
        </p>
      ) : null}

      {isPaid ? (
        <div
          className="px-5 py-4 border rounded-sm font-serif text-[1.1rem]"
          style={{ borderColor: brand, color: brand }}
        >
          Paid {data.invoice.paid_at ? formatDate(data.invoice.paid_at) : ''}.
          Thank you.
        </div>
      ) : (
        <div className="border border-hm-text/15 p-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="font-serif text-[1.2rem] leading-tight">
              {formatCents(data.invoice.total_cents)} due
            </div>
            <div className="font-garamond text-[0.9rem] text-hm-nav mt-1">
              Pay securely via Stripe.
            </div>
          </div>
          <Button variant="primary" size="lg" onClick={initiatePayment} loading={paying}>
            Pay invoice
          </Button>
        </div>
      )}
    </div>
  )
}
