// Hard-coded transactional email templates. The invoice send modal lets
// users edit the body before sending — see lib/email/render-invoice.ts
// for that flow. Proposals, POs, and studio invites still use the
// deterministic templates below.
//
// All output is inline-styled HTML so it survives Gmail / Outlook /
// Apple Mail without a <style> tag.

import { formatCents, formatDate } from '@/lib/format'
import {
  type DesignerBrand,
  brandColor,
  ctaButton,
  escape,
  escapeAttr,
  shell,
  studioName,
} from '@/lib/email/shell'

export function renderProposalEmail(opts: {
  brand: DesignerBrand
  clientName: string
  projectName: string
  proposalUrl: string
  notes?: string | null
}): { subject: string; html: string; text: string } {
  const color = brandColor(opts.brand)
  const studio = studioName(opts.brand, 'your designer')
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
  const color = brandColor(opts.brand)
  const studio = studioName(opts.brand, 'your designer')
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
  const color = brandColor(opts.brand)
  const studio = studioName(opts.brand)
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
  const color = brandColor(opts.brand)
  const studio = studioName(opts.brand, 'a studio')
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
