// Font registration for server-side react-pdf rendering.
//
// react-pdf only knows about built-in PDF fonts (Helvetica, Times, etc.) by
// default. Before we can use "Inter" / "EB Garamond" / "DM Serif Text" in a
// <Document>, we have to register them. We pull TTF assets from jsdelivr's
// @fontsource mirror, which is stable and CDN-cached.
//
// `ensureFontsRegistered()` is idempotent — call from the top of every PDF
// route handler before constructing the Document.

import { Font } from '@react-pdf/renderer'

let registered = false

const SRC = {
  interRegular:
    'https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.0/files/inter-latin-400-normal.ttf',
  interMedium:
    'https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.0/files/inter-latin-500-normal.ttf',
  interBold:
    'https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.0/files/inter-latin-700-normal.ttf',
  garamondRegular:
    'https://cdn.jsdelivr.net/npm/@fontsource/eb-garamond@5.0.0/files/eb-garamond-latin-400-normal.ttf',
  garamondMedium:
    'https://cdn.jsdelivr.net/npm/@fontsource/eb-garamond@5.0.0/files/eb-garamond-latin-500-normal.ttf',
  dmSerif:
    'https://cdn.jsdelivr.net/npm/@fontsource/dm-serif-text@5.0.0/files/dm-serif-text-latin-400-normal.ttf',
}

export function ensureFontsRegistered() {
  if (registered) return
  try {
    Font.register({
      family: 'Inter',
      fonts: [
        { src: SRC.interRegular, fontWeight: 400 },
        { src: SRC.interMedium, fontWeight: 500 },
        { src: SRC.interBold, fontWeight: 700 },
      ],
    })
    Font.register({
      family: 'EB Garamond',
      fonts: [
        { src: SRC.garamondRegular, fontWeight: 400 },
        { src: SRC.garamondMedium, fontWeight: 500 },
      ],
    })
    Font.register({
      family: 'DM Serif Text',
      fonts: [{ src: SRC.dmSerif, fontWeight: 400 }],
    })
    // Suppress automatic word-break hyphenation — design paperwork prefers
    // tight wraps that match the on-screen layout.
    Font.registerHyphenationCallback((word) => [word])
    registered = true
  } catch (e) {
    console.error('[pdf.fonts] font registration failed; falling back to Helvetica', e)
  }
}

// Brand colors mirrored from tailwind.config.ts — kept here so PDFs stay
// in sync with the app without needing to import the Tailwind config at
// runtime.
export const PDF_COLORS = {
  cream: '#eae8e0',
  elevated: '#f3f1ea',
  ink: '#1e2128',
  inkMuted: '#4a5068',
  inkSubtle: '#8a8e9c',
  line: '#d8d4c6',
  accent: '#8b3a2e',
}
