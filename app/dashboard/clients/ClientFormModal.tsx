'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Button from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { toast } from '@/components/ui/Toast'
import type { Client } from '@/lib/types-ui'

export function ClientFormModal({
  open,
  onClose,
  onSaved,
  initial,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  initial?: Client | null
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '')
      setEmail(initial?.email ?? '')
      setPhone(initial?.phone ?? '')
      setNotes(initial?.notes ?? '')
    }
  }, [open, initial])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const body = {
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        notes: notes.trim() || null,
      }
      if (initial) {
        await api.patch(`/api/clients/${initial.id}`, body)
      } else {
        await api.post('/api/clients', body)
      }
      onSaved()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit client' : 'New client'}>
      <form onSubmit={submit}>
        <Field label="Name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Email">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          </Field>
          <Field label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
        </div>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </Field>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting}>
            {initial ? 'Save' : 'Create client'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
