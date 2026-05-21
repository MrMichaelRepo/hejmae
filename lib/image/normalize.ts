// Tier-1 image normalization for uploads.
//
// All raster images go through this pipeline before they hit storage:
//   1. Auto-orient via EXIF — phone photos carry rotation tags that the
//      browser honors on <img> but our SVG overlay does not, so we bake
//      the rotation into the pixels.
//   2. Resize down to a sane max width — preserves aspect ratio. For
//      floor plans the limit is generous (line detail matters); for item
//      images it's tighter.
//   3. Re-encode to WebP at a high-quality setting. WebP handles flat
//      regions and diagonal edges noticeably better than JPEG at the
//      same byte size, which is exactly the failure mode floor plans
//      exhibit when the browser scales a 12 MP source down.
//   4. Strip metadata (no EXIF, no embedded color profiles beyond sRGB).
//
// SVG uploads are rejected upstream in lib/storage.ts: vector images can
// embed scripts/event handlers that execute when served via signed URL.
// PDF (rasterized to PNG on the floor-plan path) covers the vector use case.

import sharp from 'sharp'

export type NormalizeKind = 'floor-plan' | 'item-image'

interface NormalizeResult {
  buffer: Buffer
  contentType: string
  ext: string
  width: number
  height: number
}

const PRESETS: Record<NormalizeKind, { maxWidth: number; quality: number }> = {
  // Floor plans are mostly white background with thin lines; WebP encodes
  // that very efficiently, so we can drop both width and quality with no
  // visible loss. 2000px is plenty for any browser display, and quality 78
  // keeps text labels legible while halving file size vs quality 88.
  'floor-plan': { maxWidth: 2000, quality: 78 },
  // Item images are photographic — quality 78 is still well within
  // imperceptible-loss range for product shots viewed at thumbnail or
  // detail-pane size.
  'item-image': { maxWidth: 1400, quality: 78 },
}

export async function normalizeImage(
  input: Buffer,
  contentType: string,
  kind: NormalizeKind,
): Promise<NormalizeResult> {
  const preset = PRESETS[kind]
  const pipeline = sharp(input, { failOn: 'error' })
    .rotate() // auto-orient via EXIF, then strips the EXIF orientation tag
    .resize({
      width: preset.maxWidth,
      withoutEnlargement: true,
      fit: 'inside',
    })
    .webp({
      quality: preset.quality,
      // alpha quality matters less for floor plans / product shots;
      // default is fine.
    })

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true })

  return {
    buffer: data,
    contentType: 'image/webp',
    ext: 'webp',
    width: info.width,
    height: info.height,
  }
}
