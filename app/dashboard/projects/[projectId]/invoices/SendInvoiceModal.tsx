'use client'

// Send-invoice / send-reminder modal.
//
// Two-pane layout:
//   Left  — subject, recipients (chips), CC, reply-to, tone, focus mode,
//           ✨ Rewrite-with-AI, and the Tiptap editor body.
//   Right — live preview of the assembled email (sanitized body + brand
//           shell + deterministic pay CTA) rendered inside a sandboxed
//           iframe so email styles can't leak into the dashboard UI.
//
// The component is the same for kind='initial' and kind='reminder'; the
// `kind` prop affects the prefill template, the button label, and the
// route's status validation.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Input'
import RichTextEditor, { type FocusLevel } from '@/components/ui/RichTextEditor'
import { toast } from '@/components/ui/Toast'
import { api } from '@/lib/api'
import { formatCents } from '@/lib/format'
import type { Invoice, DefaultInvoiceEmailMode } from '@/lib/types-ui'

type EmailKind = 'initial' | 'reminder'
type Tone = 'warm' | 'professional' | 'firm'

interface Props {
  open: boolean
  projectId: string
  invoice: Invoice & { invoice_line_items?: unknown }
  clientEmail: string | null
  clientName: string | null
  studioName: string
  studioEmail: string
  brandColor: string | null
  defaultMode: DefaultInvoiceEmailMode
  kind: EmailKind
  onClose: () => void
  onSent: (next: { magic_link_url?: string }) => void
}

interface DraftResult {
  subject: string
  body_html: string
  source: 'template' | 'ai'
}

export default function SendInvoiceModal(props: Props) {
  const { open, kind, invoice, clientEmail, clientName, defaultMode, projectId } = props

  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [recipients, setRecipients] = useState<string[]>([])
  const [recipientDraft, setRecipientDraft] = useState('')
  const [cc, setCc] = useState<string[]>([])
  const [ccDraft, setCcDraft] = useState('')
  const [replyTo, setReplyTo] = useState('')
  const [tone, setTone] = useState<Tone>('warm')
  const [focusLevel, setFocusLevel] = useState<FocusLevel>('off')
  const [loadingDraft, setLoadingDraft] = useState(false)
  const [sending, setSending] = useState(false)
  const [source, setSource] = useState<'template' | 'ai'>('template')
  const initRef = useRef(false)

  // Reset when modal opens / kind changes. Fetch prefill in defaultMode.
  useEffect(() => {
    if (!open) {
      initRef.current = false
      return
    }
    if (initRef.current) return
    initRef.current = true
    setRecipients(clientEmail ? [clientEmail] : [])
    setCc([])
    setReplyTo(props.studioEmail)
    setTone('warm')
    setFocusLevel('off')
    void fetchDraft(defaultMode, 'warm')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind])

  const fetchDraft = useCallback(
    async (mode: 'template' | 'ai', toneArg: Tone) => {
      setLoadingDraft(true)
      try {
        const res = await api.post<DraftResult>(
          `/api/projects/${projectId}/invoices/${invoice.id}/email/draft`,
          { mode, kind, tone: toneArg },
        )
        const data = (res.data ?? (res as unknown as DraftResult)) as DraftResult
        setSubject(data.subject)
        setBodyHtml(data.body_html)
        setSource(data.source)
        if (mode === 'ai' && data.source === 'template') {
          toast.info('Used template — AI not available')
        }
      } catch (e) {
        toast.error((e as Error).message)
      } finally {
        setLoadingDraft(false)
      }
    },
    [projectId, invoice.id, kind],
  )

  const rewriteWithAI = () => void fetchDraft('ai', tone)

  const onSend = async () => {
    if (!subject.trim()) return toast.error('Subject is required')
    if (!recipients.length) return toast.error('Add at least one recipient')
    setSending(true)
    try {
      const res = await api.post<{
        data: unknown
        magic_link_url?: string
        email: { ok: boolean; reason?: string }
      }>(`/api/projects/${projectId}/invoices/${invoice.id}/email/send`, {
        kind,
        subject,
        body_html: bodyHtml,
        recipients,
        cc,
        reply_to: replyTo || null,
      })
      const wrapped = res as { data: unknown; magic_link_url?: string; email: { ok: boolean; reason?: string } }
      if (!wrapped.email.ok && wrapped.email.reason !== 'no_api_key') {
        toast.error(`Email failed: ${wrapped.email.reason ?? 'unknown'}`)
      } else if (wrapped.email.reason === 'no_api_key') {
        toast.success('Saved — Resend not configured, pay link copied')
      } else {
        toast.success(kind === 'reminder' ? 'Reminder sent' : 'Invoice sent')
      }
      if (wrapped.magic_link_url) {
        await navigator.clipboard.writeText(wrapped.magic_link_url).catch(() => {})
      }
      props.onSent({ magic_link_url: wrapped.magic_link_url })
      props.onClose()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  // Live preview HTML. We render client-side using a small shell mock so we
  // don't need a round-trip on every keystroke. The server-side sanitize
  // step runs at send time and is the source of truth.
  const previewHtml = useMemo(
    () => buildPreviewHtml({
      brandColor: props.brandColor,
      studioName: props.studioName,
      bodyHtml,
      total: formatCents(invoice.total_cents),
    }),
    [bodyHtml, props.brandColor, props.studioName, invoice.total_cents],
  )

  return (
    <Modal
      open={open}
      onClose={props.onClose}
      size="xl"
      title={kind === 'reminder' ? 'Send reminder' : 'Send invoice'}
    >
      <div className="grid gap-6 md:grid-cols-[1.05fr_1fr]">
        <div>
          <Field label="To">
            <RecipientChips
              values={recipients}
              draft={recipientDraft}
              setDraft={setRecipientDraft}
              setValues={setRecipients}
              placeholder={clientEmail ?? 'client@example.com'}
            />
          </Field>
          <Field label="CC (optional)">
            <RecipientChips
              values={cc}
              draft={ccDraft}
              setDraft={setCcDraft}
              setValues={setCc}
              placeholder="bookkeeper@example.com"
            />
          </Field>
          <Field label="Reply-to">
            <Input
              type="email"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder={props.studioEmail}
            />
          </Field>
          <Field label="Subject">
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
            />
          </Field>

          <div className="flex flex-wrap items-end gap-3 mb-2">
            <Field label="Tone">
              <Select value={tone} onChange={(e) => setTone(e.target.value as Tone)}>
                <option value="warm">Warm</option>
                <option value="professional">Professional</option>
                <option value="firm">Firm</option>
              </Select>
            </Field>
            <Field label="Focus mode">
              <Select
                value={focusLevel}
                onChange={(e) => setFocusLevel(e.target.value as FocusLevel)}
              >
                <option value="off">Off</option>
                <option value="paragraph">Paragraph</option>
                <option value="sentence">Sentence</option>
              </Select>
            </Field>
            <div className="mb-5 flex flex-1 justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => void fetchDraft('template', tone)}
                disabled={loadingDraft || sending}
              >
                Reset to template
              </Button>
              <Button
                variant="ghost"
                onClick={rewriteWithAI}
                disabled={loadingDraft || sending}
              >
                ✨ Rewrite with AI
              </Button>
            </div>
          </div>

          <div className="mb-2 flex items-center justify-between">
            <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav">
              Message body
            </div>
            <div className="font-garamond text-[0.85rem] text-hm-nav/80">
              {loadingDraft ? 'Drafting…' : `Source: ${source}`}
            </div>
          </div>
          <RichTextEditor
            value={bodyHtml}
            onChange={setBodyHtml}
            focusLevel={focusLevel}
            placeholder="Write your note to the client…"
          />
          <p className="mt-3 font-garamond text-[0.8rem] text-hm-nav/70">
            The pay button and total ({formatCents(invoice.total_cents)}) are
            appended below your message automatically.
          </p>
        </div>

        <div>
          <div className="mb-2 font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav">
            Live preview
          </div>
          <iframe
            title="Email preview"
            srcDoc={previewHtml}
            sandbox=""
            className="h-[560px] w-full border border-hm-text/10 bg-white"
          />
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-3 border-t border-hm-text/10 pt-5">
        <Button variant="ghost" onClick={props.onClose} disabled={sending}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onSend} disabled={sending || loadingDraft}>
          {sending
            ? 'Sending…'
            : kind === 'reminder'
              ? 'Send reminder'
              : 'Send invoice'}
        </Button>
      </div>
    </Modal>
  )
}

function RecipientChips({
  values,
  setValues,
  draft,
  setDraft,
  placeholder,
}: {
  values: string[]
  setValues: (v: string[]) => void
  draft: string
  setDraft: (v: string) => void
  placeholder?: string
}) {
  const commit = (raw: string) => {
    const v = raw.trim().replace(/,$/, '')
    if (!v) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return
    if (values.includes(v)) {
      setDraft('')
      return
    }
    setValues([...values, v])
    setDraft('')
  }
  return (
    <div className="flex flex-wrap items-center gap-1 border border-hm-text/15 bg-bg px-2 py-2 min-h-[42px]">
      {values.map((v) => (
        <span
          key={v}
          className="inline-flex items-center gap-1 border border-hm-text/15 bg-white px-2 py-0.5 font-garamond text-[0.85rem]"
        >
          {v}
          <button
            type="button"
            onClick={() => setValues(values.filter((x) => x !== v))}
            className="text-hm-nav hover:text-hm-text"
            aria-label={`Remove ${v}`}
          >
            ✕
          </button>
        </span>
      ))}
      <input
        type="email"
        value={draft}
        onChange={(e) => {
          const v = e.target.value
          if (v.endsWith(',') || v.endsWith(' ')) commit(v)
          else setDraft(v)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault()
            commit(draft)
          } else if (e.key === 'Backspace' && draft === '' && values.length) {
            setValues(values.slice(0, -1))
          }
        }}
        onBlur={() => commit(draft)}
        placeholder={values.length ? '' : placeholder}
        className="flex-1 min-w-[140px] bg-transparent font-garamond text-[0.95rem] outline-none"
      />
    </div>
  )
}

function buildPreviewHtml(args: {
  brandColor: string | null
  studioName: string
  bodyHtml: string
  total: string
}): string {
  const color = args.brandColor || '#1e2128'
  const safe = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#eae8e0;font-family:'Times New Roman',Georgia,serif;color:#1e2128;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eae8e0;">
  <tr><td align="center" style="padding:24px 12px;">
    <table width="540" cellpadding="0" cellspacing="0" border="0" style="max-width:540px;background:#eae8e0;border:1px solid rgba(30,33,40,0.1);">
      <tr><td style="padding:28px 32px;">
        <div style="text-align:center;font-family:Arial,sans-serif;font-weight:bold;font-size:13px;letter-spacing:0.22em;color:${color};text-transform:uppercase;margin-bottom:24px;">${safe(args.studioName)}</div>
        ${args.bodyHtml || '<p style="color:#9aa0ad;">Body preview…</p>'}
        <table cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;"><tr><td bgcolor="${color}" style="border-radius:9999px;"><a href="#" style="display:inline-block;padding:12px 28px;font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.2em;color:#fff;text-decoration:none;text-transform:uppercase;">Pay ${safe(args.total)}</a></td></tr></table>
        <p style="font-size:12px;line-height:1.6;color:#7a8090;margin:16px 0 0;">Pay securely via Stripe — your card never touches our servers.</p>
      </td></tr>
    </table>
    <div style="margin-top:18px;font-family:Arial,sans-serif;font-size:10px;letter-spacing:0.18em;color:#4a5068;text-transform:uppercase;">Sent via hejmae</div>
  </td></tr>
</table>
</body></html>`
}
