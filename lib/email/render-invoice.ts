// Assembles the final invoice email: user-edited (or AI-drafted) body +
// deterministic CTA footer + brand shell.
//
// The user is allowed to edit the body — greeting, message, sign-off — but
// the pay button and total-due summary are appended server-side every time.
// This means the pay link is always present, can never be stripped, and
// always rotates with the magic link.

import { formatCents } from '@/lib/format'
import {
  type DesignerBrand,
  brandColor,
  ctaButton,
  escape,
  escapeAttr,
  shell,
} from '@/lib/email/shell'
import { sanitizeEmailHtml, htmlToPlainText } from '@/lib/email/sanitize'

export interface RenderInvoiceArgs {
  brand: DesignerBrand
  subject: string
  bodyHtml: string  // raw editor or AI output — gets sanitized here
  invoice: {
    type: string
    totalCents: number
    payUrl: string
  }
  preheader?: string
}

export function renderInvoiceShell(args: RenderInvoiceArgs): {
  subject: string
  html: string
  text: string
} {
  const color = brandColor(args.brand)
  const total = formatCents(args.invoice.totalCents)
  const safeBody = sanitizeEmailHtml(args.bodyHtml)
  const preheader = args.preheader || `${total} — ${args.subject}`

  // The fixed footer: pay button + small disclaimer. We always include this,
  // regardless of what the user typed above.
  const footer = `
    ${ctaButton(args.invoice.payUrl, `Pay ${total}`, color)}
    <p style="font-size:14px;line-height:1.7;color:#4a5068;margin:8px 0 0;">
      Or paste this URL into your browser:<br/>
      <a href="${escapeAttr(args.invoice.payUrl)}" style="color:${color};word-break:break-all;">${escape(args.invoice.payUrl)}</a>
    </p>
    <p style="font-size:12px;line-height:1.6;color:#7a8090;margin:16px 0 0;">
      Pay securely via Stripe — your card never touches our servers.
    </p>
  `

  const html = shell({
    brand: args.brand,
    preheader,
    body: `${safeBody}${footer}`,
  })

  const text = `${htmlToPlainText(safeBody)}\n\nPay: ${args.invoice.payUrl}`

  return { subject: args.subject, html, text }
}
