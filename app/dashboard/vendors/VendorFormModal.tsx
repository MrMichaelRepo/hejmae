'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Button from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { toast } from '@/components/ui/Toast'
import type { Vendor } from '@/lib/types-ui'

// Inputs hold strings (because <input> values are strings); we parse to
// numbers before sending. Empty string => null.
function parseNumberOrNull(v: string): number | null {
  const t = v.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function VendorFormModal({
  open,
  onClose,
  onSaved,
  initial,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  initial?: Vendor | null
}) {
  const [name, setName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountEmail, setAccountEmail] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [tradeDiscount, setTradeDiscount] = useState('')
  const [leadTimeDays, setLeadTimeDays] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [shippingNotes, setShippingNotes] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '')
      setAccountNumber(initial?.account_number ?? '')
      setAccountEmail(initial?.account_email ?? '')
      setContactName(initial?.contact_name ?? '')
      setContactEmail(initial?.contact_email ?? '')
      setContactPhone(initial?.contact_phone ?? '')
      setWebsite(initial?.website ?? '')
      setTradeDiscount(
        initial?.trade_discount_percent != null
          ? String(initial.trade_discount_percent)
          : '',
      )
      setLeadTimeDays(
        initial?.default_lead_time_days != null
          ? String(initial.default_lead_time_days)
          : '',
      )
      setPaymentTerms(initial?.payment_terms ?? '')
      setShippingNotes(initial?.shipping_notes ?? '')
      setNotes(initial?.notes ?? '')
    }
  }, [open, initial])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const body = {
        name: name.trim(),
        account_number: accountNumber.trim() || null,
        account_email: accountEmail.trim() || null,
        contact_name: contactName.trim() || null,
        contact_email: contactEmail.trim() || null,
        contact_phone: contactPhone.trim() || null,
        website: website.trim() || null,
        trade_discount_percent: parseNumberOrNull(tradeDiscount),
        default_lead_time_days: parseNumberOrNull(leadTimeDays),
        payment_terms: paymentTerms.trim() || null,
        shipping_notes: shippingNotes.trim() || null,
        notes: notes.trim() || null,
      }
      if (initial) {
        await api.patch(`/api/vendors/${initial.id}`, body)
      } else {
        await api.post('/api/vendors', body)
      }
      onSaved()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'Edit vendor' : 'New vendor'}
    >
      <form onSubmit={submit}>
        <Field label="Name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            placeholder="e.g. RH Modern"
          />
        </Field>

        <SectionLabel>Trade account</SectionLabel>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Account number">
            <Input
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
            />
          </Field>
          <Field label="Account email">
            <Input
              value={accountEmail}
              onChange={(e) => setAccountEmail(e.target.value)}
              type="email"
              placeholder="login email"
            />
          </Field>
        </div>
        <Field label="Website">
          <Input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://"
          />
        </Field>

        <SectionLabel>Trade rep</SectionLabel>
        <Field label="Contact name">
          <Input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Contact email">
            <Input
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              type="email"
            />
          </Field>
          <Field label="Contact phone">
            <Input
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
            />
          </Field>
        </div>

        <SectionLabel>Pricing & ops</SectionLabel>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Trade discount"
            hint="% off retail. Used to auto-fill trade price on items."
          >
            <Input
              value={tradeDiscount}
              onChange={(e) => setTradeDiscount(e.target.value)}
              type="number"
              min={0}
              max={100}
              step="0.01"
              placeholder="40"
            />
          </Field>
          <Field
            label="Default lead time"
            hint="Days. Auto-fills on POs."
          >
            <Input
              value={leadTimeDays}
              onChange={(e) => setLeadTimeDays(e.target.value)}
              type="number"
              min={0}
              step="1"
              placeholder="42"
            />
          </Field>
        </div>
        <Field label="Payment terms">
          <Input
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(e.target.value)}
            placeholder="e.g. Net 30, Deposit 50%"
          />
        </Field>
        <Field label="Shipping notes">
          <Textarea
            value={shippingNotes}
            onChange={(e) => setShippingNotes(e.target.value)}
            rows={2}
            placeholder="Receiver, freight forwarder, ship-to address…"
          />
        </Field>

        <Field label="Internal notes">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </Field>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting}>
            {initial ? 'Save' : 'Create vendor'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mt-5 mb-2">
      {children}
    </div>
  )
}
