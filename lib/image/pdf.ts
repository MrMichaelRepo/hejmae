// Tier-2: PDF → PNG.
//
// Renders the first page of a PDF to a PNG buffer. We only ever take page
// one because architects' floor-plan PDFs are single-page in practice.
// (If a multi-page set comes in, the user can re-export page N and re-upload.)

import { pdf } from 'pdf-to-img'

const RENDER_SCALE = 3 // ~216 DPI vs default 72; gives sharp output before tier-1 resize

export async function rasterizePdfFirstPage(input: Buffer): Promise<Buffer> {
  const doc = await pdf(input, { scale: RENDER_SCALE })
  if (doc.length === 0) {
    throw new Error('PDF has no pages')
  }
  return doc.getPage(1)
}
