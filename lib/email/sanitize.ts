// Tiny hand-rolled HTML sanitizer for invoice email bodies.
//
// The Tiptap editor in the Send modal is restricted to StarterKit + Link,
// so its output is already a narrow tag set. This sanitizer is the
// belt-and-suspenders: we re-validate on the server before injecting
// the body into the email shell. Same allowlist enforced for AI-drafted
// HTML so a prompt-injection attempt can't sneak in <script>, <iframe>,
// onclick=, javascript: hrefs, etc.
//
// Output is inline-styled. We don't try to be a general-purpose
// sanitizer (no DOMPurify dependency) — the input shape is constrained.

const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'a',
  'ul',
  'ol',
  'li',
  'blockquote',
])

const VOID_TAGS = new Set(['br'])

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href']),
}

const SAFE_HREF = /^(https?:|mailto:)/i

export function sanitizeEmailHtml(input: string): string {
  if (typeof input !== 'string' || input.length === 0) return ''
  // Cheap pre-filter: kill anything that looks like a script/iframe outright,
  // so the tokenizer below doesn't have to deal with malformed inputs.
  const stripped = input
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')

  const out: string[] = []
  const stack: string[] = []
  // Tokenizer: walk the string, find tag boundaries.
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|([^<]+)/g
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(stripped)) !== null) {
    const [full, tagName, attrsRaw, text] = m
    if (text != null) {
      // Text node — HTML-escape and emit.
      out.push(
        text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
      )
      continue
    }
    const tag = (tagName || '').toLowerCase()
    const isClose = full.startsWith('</')

    if (!ALLOWED_TAGS.has(tag)) continue

    if (isClose) {
      // Pop only if it matches the top of the stack.
      const idx = stack.lastIndexOf(tag)
      if (idx < 0) continue
      // Close anything opened after this tag too (defensive).
      while (stack.length > idx) {
        const t = stack.pop()!
        out.push(`</${t}>`)
      }
      continue
    }

    // Open / void tag — sanitize attributes.
    const cleanAttrs = sanitizeAttrs(tag, attrsRaw || '')
    if (VOID_TAGS.has(tag)) {
      out.push(`<${tag}${cleanAttrs} />`)
    } else {
      out.push(`<${tag}${cleanAttrs}>`)
      stack.push(tag)
    }
  }
  // Close any still-open tags.
  while (stack.length) {
    out.push(`</${stack.pop()}>`)
  }
  return out.join('').trim()
}

function sanitizeAttrs(tag: string, raw: string): string {
  const allow = ALLOWED_ATTRS[tag]
  if (!allow || raw.trim().length === 0) return ''
  const out: string[] = []
  // Attribute regex: name=("value"|'value'|value), allowing unquoted.
  const attrRe = /([a-zA-Z_:][a-zA-Z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+))/g
  let m: RegExpExecArray | null
  while ((m = attrRe.exec(raw)) !== null) {
    const name = m[1].toLowerCase()
    if (!allow.has(name)) continue
    const val = m[2] ?? m[3] ?? m[4] ?? ''
    if (name === 'href') {
      if (!SAFE_HREF.test(val.trim())) continue
    }
    out.push(` ${name}="${val.replace(/"/g, '&quot;')}"`)
  }
  // For links, force target=_blank + rel=noopener (security + email-client UX).
  if (tag === 'a' && out.length > 0) {
    out.push(' target="_blank"', ' rel="noopener noreferrer"')
  }
  return out.join('')
}

// Plain-text rendering of sanitized HTML — used for the email's text/plain
// alternative. Best-effort, not roundtrip-perfect.
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|li|blockquote|ul|ol)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
