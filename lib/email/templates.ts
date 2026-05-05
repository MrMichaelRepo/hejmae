// Email templates. Plain HTML strings, brand-aware, mobile-friendly.
// Inline styles only — most email clients ignore <style> blocks.

import { formatCents, formatDate } from '@/lib/format'

interface DesignerBrand {
  studio_name: string | null
  name: string | null
  logo_url: string | null
  brand_color: string | null
}

const FALLBACK_COLOR = '#1e2128'

function shell({
  brand,
  preheader,
  body,
}: {
  brand: DesignerBrand
  preheader: string
  body: string
}): string {
  const color = brand.brand_color || FALLBACK_COLOR
  const studio = brand.studio_name || brand.name || 'Studio'
  const logo = brand.logo_url
    ? `<img src="${escapeAttr(brand.logo_url)}" alt="${escapeAttr(studio)}" style="height:36px;display:block;margin:0 auto 24px;" />`
    : `<div style="text-align:center;font-family:Arial,sans-serif;font-weight:bold;font-size:13px;letter-spacing:0.22em;color:${color};text-transform:uppercase;margin-bottom:24px;">${escape(studio)}</div>`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escape(preheader)}</title>
</head>
<body style="margin:0;padding:0;background:#eae8e0;font-family:'Times New Roman',Georgia,serif;color:#1e2128;">
<span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;font-size:0;">${escape(preheader)}</span>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eae8e0;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#eae8e0;border:1px solid rgba(30,33,40,0.1);">
        <tr>
          <td style="padding:32px 36px;">
            ${logo}
            ${body}
          </td>
        </tr>
      </table>
      <div style="margin-top:18px;font-family:Arial,sans-serif;font-size:10px;letter-spacing:0.18em;color:#4a5068;text-transform:uppercase;">
        Sent via hejmae
      </div>
    </td>
  </tr>
</table>
</body>
</html>`
}

function ctaButton(url: string, label: string, color: string): string {
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
  <tr><td bgcolor="${color}" style="border-radius:9999px;">
    <a href="${escapeAttr(url)}" style="display:inline-block;padding:12px 28px;font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.2em;color:#ffffff;text-decoration:none;text-transform:uppercase;">${escape(label)}</a>
  </td></tr>
</table>`
}

export function renderProposalEmail(opts: {
  brand: DesignerBrand
  clientName: string
  projectName: string
  proposalUrl: string
  notes?: string | null
}): { subject: string; html: string; text: string } {
  const color = opts.brand.brand_color || FALLBACK_COLOR
  const studio = opts.brand.studio_name || opts.brand.name || 'your designer'
  const subject = `Proposal: ${opts.projectName}`
  const body = `
    <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.15;margin:0 0 16px;color:#1e2128;">
      A proposal for ${escape(opts.projectName)}
    </h1>
    <p style="font-size:16px;line-height:1.7;color:#4a5068;margin:0 0 16px;">
      Hi ${escape(opts.clientName)}, ${escape(studio)} has prepared a room-by-room proposal for your review. You can approve each room individually directly from the link below — no account needed.
    </p>
    ${opts.notes ? `<p style="font-size:15px;line-height:1.7;color:#4a5068;font-style:italic;border-left:2px solid ${color}30;padding-left:16px;margin:16px 0;">${escape(opts.notes)}</p>` : ''}
    ${ctaButton(opts.proposalUrl, 'Review proposal', color)}
    <p style="font-size:14px;line-height:1.7;color:#4a5068;margin:16px 0 0;">
      Or paste this URL into your browser:<br/>
      <a href="${escapeAttr(opts.proposalUrl)}" style="color:${color};word-break:break-all;">${escape(opts.proposalUrl)}</a>
    </p>
  `
  return {
    subject,
    html: shell({ brand: opts.brand, preheader: `Proposal for ${opts.projectName}`, body }),
    text: `Hi ${opts.clientName},\n\n${studio} has prepared a proposal for ${opts.projectName}. Review and approve room by room here:\n\n${opts.proposalUrl}\n\n— ${studio}`,
  }
}

export function renderInvoiceEmail(opts: {
  brand: DesignerBrand
  clientName: string
  projectName: string
  invoiceType: string
  totalCents: number
  invoiceUrl: string
  dueDate?: string | null
  notes?: string | null
}): { subject: string; html: string; text: string } {
  const color = opts.brand.brand_color || FALLBACK_COLOR
  const studio = opts.brand.studio_name || opts.brand.name || 'your designer'
  const total = formatCents(opts.totalCents)
  const subject = `Invoice: ${opts.projectName} — ${total}`
  const body = `
    <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.15;margin:0 0 16px;color:#1e2128;">
      ${escape(total)} — ${escape(opts.projectName)}
    </h1>
    <p style="font-size:16px;line-height:1.7;color:#4a5068;margin:0 0 16px;">
      Hi ${escape(opts.clientName)}, here's your ${escape(opts.invoiceType)} invoice from ${escape(studio)}.
      ${opts.dueDate ? `Due by ${escape(formatDate(opts.dueDate))}.` : ''}
    </p>
    ${opts.notes ? `<p style="font-size:15px;line-height:1.7;color:#4a5068;font-style:italic;border-left:2px solid ${color}30;padding-left:16px;margin:16px 0;">${escape(opts.notes)}</p>` : ''}
    ${ctaButton(opts.invoiceUrl, `Pay ${total}`, color)}
    <p style="font-size:14px;line-height:1.7;color:#4a5068;margin:16px 0 0;">
      Pay securely via Stripe — your card never touches our servers.
    </p>
  `
  return {
    subject,
    html: shell({ brand: opts.brand, preheader: `${total} due — ${opts.projectName}`, body }),
    text: `Hi ${opts.clientName},\n\nHere's your ${opts.invoiceType} invoice from ${studio} for ${opts.projectName}: ${total}.\n\nPay securely:\n${opts.invoiceUrl}\n\n— ${studio}`,
  }
}

export function renderPOEmail(opts: {
  brand: DesignerBrand
  vendorName: string
  projectName: string
  poId: string
  totalCents: number
  expectedLeadTimeDays?: number | null
  printUrl: string
  notes?: string | null
}): { subject: string; html: string; text: string } {
  const color = opts.brand.brand_color || FALLBACK_COLOR
  const studio = opts.brand.studio_name || opts.brand.name || 'Studio'
  const total = formatCents(opts.totalCents)
  const subject = `Purchase Order ${opts.poId.slice(0, 8).toUpperCase()} — ${opts.projectName}`
  const body = `
    <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.2;margin:0 0 16px;color:#1e2128;">
      Purchase Order #${escape(opts.poId.slice(0, 8).toUpperCase())}
    </h1>
    <p style="font-size:16px;line-height:1.7;color:#4a5068;margin:0 0 8px;">
      Hi ${escape(opts.vendorName)},
    </p>
    <p style="font-size:16px;line-height:1.7;color:#4a5068;margin:0 0 16px;">
      Please find a purchase order from ${escape(studio)} for project <strong>${escape(opts.projectName)}</strong>, total ${escape(total)}.
      ${opts.expectedLeadTimeDays ? ` Expected lead time: ${opts.expectedLeadTimeDays} days.` : ''}
    </p>
    ${opts.notes ? `<p style="font-size:15px;line-height:1.7;color:#4a5068;font-style:italic;border-left:2px solid ${color}30;padding-left:16px;margin:16px 0;">${escape(opts.notes)}</p>` : ''}
    ${ctaButton(opts.printUrl, 'View / print PO', color)}
    <p style="font-size:14px;line-height:1.7;color:#4a5068;margin:16px 0 0;">
      Please confirm receipt and expected ship date by reply.
    </p>
  `
  return {
    subject,
    html: shell({ brand: opts.brand, preheader: `PO from ${studio} for ${opts.projectName}`, body }),
    text: `Hi ${opts.vendorName},\n\nPlease find a PO from ${studio} for ${opts.projectName} (${total}). View it here:\n${opts.printUrl}\n\nPlease confirm receipt by reply.\n\n— ${studio}`,
  }
}

export function renderStudioInviteEmail(opts: {
  brand: DesignerBrand
  inviterName: string
  acceptUrl: string
  role: string
}): { subject: string; html: string; text: string } {
  const color = opts.brand.brand_color || FALLBACK_COLOR
  const studio = opts.brand.studio_name || opts.brand.name || 'a studio'
  const subject = `${opts.inviterName} invited you to ${studio} on hejmae`
  const body = `
    <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.15;margin:0 0 16px;color:#1e2128;">
      You're invited to ${escape(studio)}
    </h1>
    <p style="font-size:16px;line-height:1.7;color:#4a5068;margin:0 0 16px;">
      ${escape(opts.inviterName)} added you as a <strong>${escape(opts.role)}</strong> on ${escape(studio)} in hejmae. Accept to start collaborating on projects, rooms, and proposals.
    </p>
    ${ctaButton(opts.acceptUrl, 'Accept invite', color)}
    <p style="font-size:14px;line-height:1.7;color:#4a5068;margin:16px 0 0;">
      Or paste this URL into your browser:<br/>
      <a href="${escapeAttr(opts.acceptUrl)}" style="color:${color};word-break:break-all;">${escape(opts.acceptUrl)}</a>
    </p>
    <p style="font-size:13px;line-height:1.6;color:#7a8090;margin:20px 0 0;">
      If you didn't expect this email, you can safely ignore it.
    </p>
  `
  return {
    subject,
    html: shell({ brand: opts.brand, preheader: `Join ${studio} on hejmae`, body }),
    text: `${opts.inviterName} invited you to join ${studio} on hejmae as a ${opts.role}.\n\nAccept your invite:\n${opts.acceptUrl}\n\nIf you didn't expect this, ignore this email.`,
  }
}

// HTML escapers — small but essential.
function escape(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
function escapeAttr(s: string): string {
  return escape(s).replace(/"/g, '&quot;')
}
