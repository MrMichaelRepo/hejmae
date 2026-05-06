// Tier-3: AI-assisted floor-plan straightening.
//
// What we do:
//   1. Send the (already tier-1 normalized) WebP to Claude Haiku 4.5 with
//      a strict JSON-only prompt asking for the four corners of the floor
//      plan in the image, in clockwise order starting top-left, as
//      fractions of width/height.
//   2. If the model returns valid corners, we deskew + crop:
//        - rotate the image so the top edge of the quad is horizontal
//        - extract the bounding rect of the rotated quad
//      This handles "phone shot tilted by 5–20°" and "floor plan on a
//      messy desk" cleanly without a true projective warp.
//
// What we do NOT do (yet):
//   - True 4-point perspective correction (trapezoid → rectangle). That
//     needs a homography + bilinear resampling. The rotate-and-crop pass
//     above gets ~80% of the perceived improvement at 0% added deps; if
//     users send dramatically angled phone shots we can revisit and add
//     `image-js` or a small homography routine.
//
// All steps soft-fail: if the API key is missing, the API call errors,
// the response isn't parseable, or the corners look unreasonable, we
// return the input unchanged. The caller (lib/storage.ts) treats null /
// error as "use the tier-1 buffer as-is".

import sharp from 'sharp'
import Anthropic from '@anthropic-ai/sdk'
import { env } from '@/lib/env'

interface Point {
  x: number
  y: number
}

interface Quad {
  topLeft: Point
  topRight: Point
  bottomRight: Point
  bottomLeft: Point
}

const VISION_MODEL = 'claude-haiku-4-5-20251001'

// Prompt deliberately constrains the response to JSON only; Haiku is
// reliable enough at this with a one-shot example that we don't need
// tool-use scaffolding.
const PROMPT = `You are a vision system that finds the floor plan in an uploaded image.

Look at this image. Identify the four corners of the floor plan (the rectangular drawing of the building's layout) in the image.

Respond with ONLY a JSON object, no prose, no code fence. Schema:

{
  "found": boolean,
  "corners": {
    "topLeft":    { "x": number, "y": number },
    "topRight":   { "x": number, "y": number },
    "bottomRight":{ "x": number, "y": number },
    "bottomLeft": { "x": number, "y": number }
  } | null
}

All x and y values are fractions in [0, 1] of the image width and height. Top-left is the corner that appears in the upper-left of the floor-plan drawing as you look at the image (regardless of the floor plan's internal orientation).

Set "found" to false and "corners" to null if:
- the image isn't a floor plan
- the floor plan has no clear rectangular boundary (e.g. an irregular page edge)
- you're less than fairly confident about the corner positions

Return JSON only.`

interface DetectResult {
  found: boolean
  corners: Quad | null
}

async function detectCorners(buf: Buffer): Promise<DetectResult | null> {
  const apiKey = env.anthropicApiKey()
  if (!apiKey) return null

  const client = new Anthropic({ apiKey })
  const base64 = buf.toString('base64')

  const res = await client.messages.create({
    model: VISION_MODEL,
    max_tokens: 400,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/webp',
              data: base64,
            },
          },
          { type: 'text', text: PROMPT },
        ],
      },
    ],
  })

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
  if (!text) return null

  // Defensive: trim any code-fence wrapping.
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  try {
    const parsed = JSON.parse(cleaned) as DetectResult
    if (!parsed.found || !parsed.corners) return parsed
    if (!isValidQuad(parsed.corners)) return null
    return parsed
  } catch {
    return null
  }
}

function isValidQuad(q: Quad): boolean {
  const pts = [q.topLeft, q.topRight, q.bottomRight, q.bottomLeft]
  for (const p of pts) {
    if (typeof p?.x !== 'number' || typeof p?.y !== 'number') return false
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false
    if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return false
  }
  // Reject degenerate quads (e.g. all four points collapsed).
  const minSide = 0.1 // quad must span at least 10% of the image
  const w = Math.max(
    Math.hypot(q.topRight.x - q.topLeft.x, q.topRight.y - q.topLeft.y),
    Math.hypot(q.bottomRight.x - q.bottomLeft.x, q.bottomRight.y - q.bottomLeft.y),
  )
  const h = Math.max(
    Math.hypot(q.bottomLeft.x - q.topLeft.x, q.bottomLeft.y - q.topLeft.y),
    Math.hypot(q.bottomRight.x - q.topRight.x, q.bottomRight.y - q.topRight.y),
  )
  return w >= minSide && h >= minSide
}

// Rotate around the image center; returns the rotation matrix we'll need
// to map the quad's corners into the rotated frame.
function rotatePoint(p: Point, cx: number, cy: number, angleRad: number): Point {
  const cos = Math.cos(angleRad)
  const sin = Math.sin(angleRad)
  const dx = p.x - cx
  const dy = p.y - cy
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }
}

interface DeskewResult {
  buffer: Buffer
  width: number
  height: number
}

async function deskewAndCrop(
  input: Buffer,
  width: number,
  height: number,
  q: Quad,
): Promise<DeskewResult> {
  // Convert fractional corners to pixel coords.
  const cornersPx: Point[] = [
    { x: q.topLeft.x * width, y: q.topLeft.y * height },
    { x: q.topRight.x * width, y: q.topRight.y * height },
    { x: q.bottomRight.x * width, y: q.bottomRight.y * height },
    { x: q.bottomLeft.x * width, y: q.bottomLeft.y * height },
  ]

  // Compute deviation-from-horizontal for each of the four edges, then take
  // the median. Median (vs. just the top edge) is more robust to perspective
  // distortion and to Haiku occasionally jittering one corner.
  //
  // Verticals are expressed as (their angle - 90°) so all four numbers
  // share the same "off horizontal" reference.
  const edgeAngles: number[] = [
    Math.atan2(cornersPx[1].y - cornersPx[0].y, cornersPx[1].x - cornersPx[0].x),
    Math.atan2(cornersPx[2].y - cornersPx[3].y, cornersPx[2].x - cornersPx[3].x),
    Math.atan2(cornersPx[3].y - cornersPx[0].y, cornersPx[3].x - cornersPx[0].x) - Math.PI / 2,
    Math.atan2(cornersPx[2].y - cornersPx[1].y, cornersPx[2].x - cornersPx[1].x) - Math.PI / 2,
  ]
  edgeAngles.sort((a, b) => a - b)
  const medianRad = (edgeAngles[1] + edgeAngles[2]) / 2
  const angleDeg = (medianRad * 180) / Math.PI

  // Sharp rotates clockwise for positive degrees; we want to rotate the
  // image opposite to the edge slope so the slope ends at 0°.
  const rotateBy = -angleDeg

  // After rotation around the image center, sharp expands the canvas to
  // fit the rotated bounds. Compute the new canvas size and the offset
  // applied to all original pixel coords (the rotation pivot stays the
  // image center, which moves to the new canvas center).
  const angleRad = (rotateBy * Math.PI) / 180
  const cosA = Math.abs(Math.cos(angleRad))
  const sinA = Math.abs(Math.sin(angleRad))
  const newW = Math.ceil(width * cosA + height * sinA)
  const newH = Math.ceil(height * cosA + width * sinA)
  const oldCx = width / 2
  const oldCy = height / 2
  const newCx = newW / 2
  const newCy = newH / 2

  // Map each corner into the rotated frame: rotate around old center, then
  // translate so the new image origin is correct.
  const rotated = cornersPx.map((p) => {
    const r = rotatePoint(p, oldCx, oldCy, angleRad)
    return { x: r.x - oldCx + newCx, y: r.y - oldCy + newCy }
  })

  // Bounding box of the rotated quad, with padding so we don't shave the
  // floor plan's outer wall. 2.5% of the smaller dimension (~50px on a
  // 2000px image) gives a comfortable buffer that absorbs both Haiku's
  // corner jitter and a bit of breathing room around the drawing.
  const pad = Math.round(Math.min(newW, newH) * 0.025)
  const minX = Math.max(0, Math.floor(Math.min(...rotated.map((p) => p.x)) - pad))
  const minY = Math.max(0, Math.floor(Math.min(...rotated.map((p) => p.y)) - pad))
  const maxX = Math.min(newW, Math.ceil(Math.max(...rotated.map((p) => p.x)) + pad))
  const maxY = Math.min(newH, Math.ceil(Math.max(...rotated.map((p) => p.y)) + pad))
  const cropW = maxX - minX
  const cropH = maxY - minY
  if (cropW <= 0 || cropH <= 0) {
    throw new Error('Computed crop is empty')
  }

  const buffer = await sharp(input)
    .rotate(rotateBy, { background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .extract({ left: minX, top: minY, width: cropW, height: cropH })
    .webp({ quality: 78 })
    .toBuffer()
  return { buffer, width: cropW, height: cropH }
}

export interface StraightenResult {
  buffer: Buffer
  width: number
  height: number
  // True when the AI step ran and produced a usable result.
  applied: boolean
}

export async function straightenFloorPlan(
  input: Buffer,
  width: number,
  height: number,
): Promise<StraightenResult> {
  if (!env.floorPlanAutoStraighten() || !env.anthropicApiKey()) {
    return { buffer: input, width, height, applied: false }
  }
  try {
    const detected = await detectCorners(input)
    if (!detected || !detected.found || !detected.corners) {
      return { buffer: input, width, height, applied: false }
    }
    const out = await deskewAndCrop(input, width, height, detected.corners)
    return { ...out, applied: true }
  } catch (err) {
    console.warn('[image] auto-straighten failed; using normalized input', err)
    return { buffer: input, width, height, applied: false }
  }
}
