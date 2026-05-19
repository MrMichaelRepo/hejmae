// Brand-aware email shell + reusable building blocks. Used by both the
// legacy hard-coded templates (lib/email/templates.ts) and the new
// user-editable invoice send flow (lib/email/render-invoice.ts).
//
// All output is inline-styled HTML so it survives Gmail / Outlook /
// Apple Mail without a <style> tag.

export interface DesignerBrand {
  studio_name: string | null
  name: string | null
  logo_url: string | null
  brand_color: string | null
}

export const FALLBACK_COLOR = '#1e2128'

export function brandColor(brand: DesignerBrand): string {
  return brand.brand_color || FALLBACK_COLOR
}

export function studioName(brand: DesignerBrand, fallback = 'Studio'): string {
  return brand.studio_name || brand.name || fallback
}

export function shell({
  brand,
  preheader,
  body,
}: {
  brand: DesignerBrand
  preheader: string
  body: string
}): string {
  const color = brandColor(brand)
  const studio = studioName(brand)
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

export function ctaButton(url: string, label: string, color: string): string {
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
  <tr><td bgcolor="${color}" style="border-radius:9999px;">
    <a href="${escapeAttr(url)}" style="display:inline-block;padding:12px 28px;font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.2em;color:#ffffff;text-decoration:none;text-transform:uppercase;">${escape(label)}</a>
  </td></tr>
</table>`
}

export function escape(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function escapeAttr(s: string): string {
  return escape(s).replace(/"/g, '&quot;')
}
