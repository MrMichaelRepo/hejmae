// Final pass over a floor-plan image: force-landscape + whiten-background.
//
// Always runs (regardless of whether tier-3 AI straightening was applied),
// because the inputs that need this treatment — phone shots of paper plans
// on a tan desk, scanned plans with off-white paper — also benefit from
// the cleanup whether or not Haiku found their corners.

import sharp from 'sharp'

interface PostprocessResult {
  buffer: Buffer
  width: number
  height: number
}

// Linear remap pushing light tones to pure white while preserving black
// lines. With slope=1.7, offset=-90:
//   input 200 → 1.7·200 - 90 = 250 → near white
//   input 175 → 1.7·175 - 90 = 207 (still bright)
//   input 100 → 1.7·100 - 90 = 80  (mid-tone darkened — fine)
//   input 53  → 1.7·53  - 90 = 0   (clamps; lines stay black)
// Tan-paper backgrounds (~210), beige-desk shadows (~190), and JPEG
// halos around lines all go to near-white; pencil/ink (~30 or less) get
// crushed darker, improving contrast.
const WHITEN_SLOPE = 1.7
const WHITEN_OFFSET = -90

export async function postprocessFloorPlan(
  input: Buffer,
  width: number,
  height: number,
): Promise<PostprocessResult> {
  // Step 1: rotate to landscape if portrait, and flatten any alpha onto a
  // white background so transparent PNGs don't end up with grey/black
  // pixels after WebP encode.
  let working = input
  let w = width
  let h = height
  if (h > w) {
    working = await sharp(working)
      .flatten({ background: '#ffffff' })
      .rotate(90)
      .toBuffer()
    const swap = w
    w = h
    h = swap
  } else {
    working = await sharp(working)
      .flatten({ background: '#ffffff' })
      .toBuffer()
  }

  // Step 2: drop saturation so cream/tan tints lose their colour cast,
  // then whiten with `.normalize()` + `.linear()`. Saturation removal
  // helps because off-white paper appears as low-saturation yellow; once
  // it's neutral grey the linear pass treats it the same as a white-point
  // scan and lifts it to true white.
  const final = await sharp(working)
    .modulate({ saturation: 0.15 })
    .normalize()
    .linear(WHITEN_SLOPE, WHITEN_OFFSET)
    .webp({ quality: 78 })
    .toBuffer()

  return { buffer: final, width: w, height: h }
}
