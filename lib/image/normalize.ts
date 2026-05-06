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
// SVG is passed through untouched — vectors don't need rasterization, and
// running them through sharp would discard the scalability benefit.

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
  // Floor plans: keep enough detail that text labels stay legible.
  'floor-plan': { maxWidth: 2400, quality: 88 },
  // Item images: phone-camera product shots — smaller is fine.
  'item-image': { maxWidth: 1600, quality: 82 },
}

export async function normalizeImage(
  input: Buffer,
  contentType: string,
  kind: NormalizeKind,
): Promise<NormalizeResult> {
  // SVG: pass through. Sharp can rasterize SVG but we explicitly want to
  // preserve vector resolution.
  if (contentType === 'image/svg+xml') {
    return {
      buffer: input,
      contentType,
      ext: 'svg',
      width: 0,
      height: 0,
    }
  }

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
