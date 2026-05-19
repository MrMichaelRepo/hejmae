// Deterministic prefill for the invoice Send modal body.
//
// Returns the editable body HTML (the part the user can rewrite — no CTA,
// no brand shell). The Send route deterministically appends the pay button
// and total-due footer at send time so the user can't accidentally delete
// the pay link.
//
// Three tones (warm / professional / firm) and two kinds (initial / reminder).
// Output uses only the tags the editor's allowlist accepts: p, strong, em, br.

import { formatCents, formatDate } from '@/lib/format'
import { escape, escapeAttr, type DesignerBrand, studioName } from '@/lib/email/shell'

export type EmailTone = 'warm' | 'professional' | 'firm'
export type EmailKind = 'initial' | 'reminder'

export interface InvoicePrefillInput {
  brand: DesignerBrand
  client: { name: string }
  project: { name: string }
  invoice: {
    type: 'deposit' | 'progress' | 'final'
    total_cents: number
    notes?: string | null
    due_at?: string | null
    daysOverdue?: number | null
  }
  kind: EmailKind
  tone?: EmailTone
}

export function templateInvoiceEmail(
  input: InvoicePrefillInput,
): { subject: string; body_html: string } {
  const tone: EmailTone = input.tone ?? 'warm'
  const studio = studioName(input.brand, 'your designer')
  const total = formatCents(input.invoice.total_cents)
  const projectName = input.project.name
  const clientFirst = input.client.name.split(/\s+/)[0] || input.client.name
  const dueLine = input.invoice.due_at
    ? `Due by ${escape(formatDate(input.invoice.due_at))}.`
    : ''

  if (input.kind === 'reminder') {
    const daysOverdueCopy =
      input.invoice.daysOverdue && input.invoice.daysOverdue > 0
        ? ` It's ${input.invoice.daysOverdue} day${input.invoice.daysOverdue === 1 ? '' : 's'} past due.`
        : ''
    const subject =
      tone === 'firm'
        ? `Past due: ${projectName} — ${total}`
        : tone === 'professional'
          ? `Reminder: invoice for ${projectName}`
          : `Quick nudge — ${projectName} invoice`

    const body = paragraphs(
      `Hi ${escape(clientFirst)},`,
      tone === 'firm'
        ? `This is a follow-up on the outstanding invoice for ${escape(projectName)}, ${escape(total)}.${daysOverdueCopy} Please settle at your earliest convenience.`
        : tone === 'professional'
          ? `Following up on the invoice for ${escape(projectName)} (${escape(total)}).${daysOverdueCopy} ${dueLine}`
          : `Just a quick nudge on the invoice for ${escape(projectName)} — ${escape(total)} is still outstanding.${daysOverdueCopy} No rush, but wanted to keep it on your radar.`,
      tone === 'firm'
        ? `If payment has already been sent, please disregard this note.`
        : `Let me know if you have any questions or need a fresh link.`,
      `Thanks,<br/>${escape(studio)}`,
    )
    return { subject, body_html: body }
  }

  // initial
  const typeLabel =
    input.invoice.type === 'deposit'
      ? 'deposit'
      : input.invoice.type === 'final'
        ? 'final'
        : 'progress'

  const subject =
    tone === 'firm'
      ? `Invoice for ${projectName} — ${total} due`
      : tone === 'professional'
        ? `Invoice: ${projectName} (${total})`
        : `Your ${typeLabel} invoice for ${projectName}`

  const opener =
    tone === 'firm'
      ? `Please find the ${typeLabel} invoice for ${escape(projectName)} attached: ${escape(total)}.`
      : tone === 'professional'
        ? `Here's the ${typeLabel} invoice for ${escape(projectName)} — ${escape(total)}.`
        : `Hope you're doing well! Here's your ${typeLabel} invoice for ${escape(projectName)} — ${escape(total)}.`

  const noteBlock = input.invoice.notes
    ? `<p style="margin:0 0 16px;font-style:italic;">${escape(input.invoice.notes)}</p>`
    : ''

  const body =
    paragraphs(
      `Hi ${escape(clientFirst)},`,
      opener,
      dueLine ||
        (tone === 'warm'
          ? 'You can pay any time using the link below.'
          : 'Payment instructions are below.'),
    ) +
    noteBlock +
    paragraphs(
      tone === 'firm'
        ? `Please confirm receipt by reply.`
        : `Let me know if you have any questions.`,
      `Thanks,<br/>${escape(studio)}`,
    )

  return { subject, body_html: body }
}

function paragraphs(...lines: string[]): string {
  return lines
    .map(
      (l) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#4a5068;">${l}</p>`,
    )
    .join('')
}

// Avoid an "unused import" warning if escapeAttr is needed later for hrefs
// in templates. Re-export so future tone/template additions can reach for it.
export { escapeAttr }
