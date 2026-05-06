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
// lines. With slope=1.4, offset=-50:
//   input 220 → 1.4·220 - 50 = 258 → clamps to 255 (white)
//   input 180 → 1.4·180 - 50 = 202 (still bright)
//   input 100 → 1.4·100 - 50 = 90 (mid-tone, slightly darker — fine)
//   input 0   → -50 → clamps to 0 (lines stay black)
// Tan-paper backgrounds (~225) and beige-desk shadows (~200) both go to
// near-white; pencil/ink lines (~30 or less) get crushed slightly darker,
// which actually improves contrast.
const WHITEN_SLOPE = 1.4
const WHITEN_OFFSET = -50

export async function postprocessFloorPlan(
  input: Buffer,
  width: number,
  height: number,
): Promise<PostprocessResult> {
  // Step 1: rotate to landscape if portrait. We pick a 90° CW rotation —
  // either direction works; CW is conventional for "reading the long edge
  // as horizontal."
  let working = input
  let w = width
  let h = height
  if (h > w) {
    working = await sharp(working).rotate(90).toBuffer()
    const swap = w
    w = h
    h = swap
  }

  // Step 2: whiten the background. `.normalize()` first stretches the
  // current histogram to the full 0..255 range (handles low-contrast
  // scans). `.linear()` then pushes the upper end to pure white.
  const final = await sharp(working)
    .normalize()
    .linear(WHITEN_SLOPE, WHITEN_OFFSET)
    .webp({ quality: 78 })
    .toBuffer()

  return { buffer: final, width: w, height: h }
}
