// Haiku-vision floor-plan vectorization.
//
// Given a floor-plan image (the WebP we already have on Supabase Storage),
// ask Claude Haiku to return a structured spec of walls, doors, windows,
// and room labels in fractional 0..1 coords. The renderer turns that into
// a clean SVG drawing.
//
// Soft-fail philosophy: caller decides what to do with `null`. We return
// null for missing API key, missing/garbled response, or schema-failed
// output. We surface real errors (API rejection, network) by throwing —
// the caller logs them; we don't silently swallow.

import sharp from 'sharp'
import Anthropic from '@anthropic-ai/sdk'
import { env } from '@/lib/env'
import type { FloorPlanVector, PolygonPoint } from '@/lib/supabase/types'

// Sonnet 4.6 vs Haiku: this task involves tracing dozens of small line
// segments under perspective + handwritten clutter. Haiku 4.5 produces
// usable corner-detection (the straighten step) but its wall tracing is
// not reliable enough to ship. Sonnet 4.6 costs ~5x more per call but
// the output is dramatically more accurate.
const VISION_MODEL = 'claude-sonnet-4-6'

// 1600px gives Sonnet enough detail to read thin interior walls without
// exploding the token cost. The vision encoder downsamples internally
// past this point regardless.
const VISION_MAX_WIDTH = 1600

const PROMPT = `You are extracting a clean vector floor plan from a photo or scan.

The image is a floor plan, possibly with handwritten dimension annotations and shadows. IGNORE all handwritten numbers, text, dimension lines (the thin lines with arrows or fractions next to them), title blocks, logos, page borders, and the compass arrow. Trace ONLY the printed walls of the building.

Output ONLY a JSON object, no prose, no code fence:

{
  "found": boolean,
  "spec": {
    "walls":  [ { "a": {"x": <0..1>, "y": <0..1>}, "b": {"x": <0..1>, "y": <0..1>}, "kind": "exterior" | "interior" } ],
    "doors":  [ { "a": {"x": <0..1>, "y": <0..1>}, "b": {"x": <0..1>, "y": <0..1>}, "pivot": "a" | "b", "swing": "cw" | "ccw" } ],
    "windows":[ { "a": {"x": <0..1>, "y": <0..1>}, "b": {"x": <0..1>, "y": <0..1>} } ],
    "room_labels": [ { "name": "string", "at": {"x": <0..1>, "y": <0..1>} } ]
  } | null
}

CRITICAL coordinate convention:
- x and y are fractions of the IMAGE width and height. The top-left of the image is (0, 0), bottom-right is (1, 1).
- NEVER output pixel coordinates. NEVER output values outside [0, 1]. If you're unsure, normalize.

CRITICAL wall rules:
- Trace each wall as ONE straight line segment from a corner/T-junction to the next corner/T-junction. The thick black borders of rooms ARE walls; their handwritten dimension annotations are not.
- Almost all residential walls are EITHER horizontal OR vertical. Snap to the nearest of those two unless the wall is clearly diagonal in the source.
- Thick double-line walls in plans = ONE wall along the centerline.
- Walls should connect end-to-end at corners (don't leave gaps at junctions).
- Mark walls on the building's outer perimeter as "exterior", everything else as "interior".

CRITICAL door rules:
- A door is a SHORT gap in a wall, typically 24-40 inches. In fractional coords, this is usually 0.02 to 0.10 of the image's smaller dimension.
- NEVER output a door longer than 0.15. If the segment is longer, it is not a door.
- "a" and "b" are the two endpoints of the gap (the segment WHERE the door is, not the swing arc).
- "pivot" is the hinge endpoint. "swing" is the rotation direction the door opens, looking at the image: "cw" = clockwise, "ccw" = counter-clockwise.

CRITICAL window rules:
- Windows are gaps in EXTERIOR walls only. Length usually 0.04 to 0.20.
- "a" and "b" are the endpoints of the window opening.

Other:
- Up to 200 walls, 30 doors, 30 windows, 30 room_labels.
- "room_labels" is OPTIONAL. Only include if a room's name is clearly written in the image. Place "at" inside the room.

Set "found": false and "spec": null if:
- The image isn't a floor plan
- You can't reliably trace at least 8 wall segments
- You're not reasonably confident in the geometry

Return JSON only.`

interface RawSpecPoint {
  x: unknown
  y: unknown
}
interface RawWall {
  a: RawSpecPoint
  b: RawSpecPoint
  kind?: unknown
}
interface RawDoor {
  a: RawSpecPoint
  b: RawSpecPoint
  pivot?: unknown
  swing?: unknown
}
interface RawWindow {
  a: RawSpecPoint
  b: RawSpecPoint
}
interface RawLabel {
  name: unknown
  at: RawSpecPoint
}
interface RawSpec {
  walls?: RawWall[]
  doors?: RawWindow[]
  windows?: RawWindow[]
  room_labels?: RawLabel[]
}
interface RawResponse {
  found?: unknown
  spec?: RawSpec | null
}

function point(p: RawSpecPoint | undefined): PolygonPoint | null {
  if (!p) return null
  if (typeof p.x !== 'number' || typeof p.y !== 'number') return null
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null
  // Reject obviously-out-of-range coords (likely pixel coords). The
  // renderer can't recover from these — clamping to [0,1] would just
  // collapse them onto an edge. Allow a small overshoot (up to 1.05)
  // because the model occasionally outputs 1.002 for a wall on the
  // image edge.
  if (p.x < -0.05 || p.x > 1.05) return null
  if (p.y < -0.05 || p.y > 1.05) return null
  return {
    x: Math.min(1, Math.max(0, p.x)),
    y: Math.min(1, Math.max(0, p.y)),
  }
}

function segmentLength(a: PolygonPoint, b: PolygonPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

// Snap near-axis-aligned walls to perfectly orthogonal. ~80% of model
// errors are 1-3° tilts on what should be a horizontal/vertical wall;
// snapping when the deviation is small gives much cleaner output without
// damaging genuinely diagonal walls.
function orthogonalize(a: PolygonPoint, b: PolygonPoint): [PolygonPoint, PolygonPoint] {
  const dx = Math.abs(b.x - a.x)
  const dy = Math.abs(b.y - a.y)
  if (dx === 0 && dy === 0) return [a, b]
  // Tan(5°) ≈ 0.087. If the wall's tilt off horizontal/vertical is less
  // than ~5°, snap it. Diagonals (e.g. a chamfered corner) are clearly
  // tilted further than that.
  const tilt = Math.min(dx, dy) / Math.max(dx, dy)
  if (tilt > 0.087) return [a, b]
  if (dx > dy) {
    // Snap to horizontal — average y, keep x.
    const y = (a.y + b.y) / 2
    return [
      { x: a.x, y },
      { x: b.x, y },
    ]
  }
  // Snap to vertical — average x, keep y.
  const x = (a.x + b.x) / 2
  return [
    { x, y: a.y },
    { x, y: b.y },
  ]
}

// Snap clusters of wall endpoints to a single shared point. Sonnet
// returns endpoints that are visually-but-not-numerically the same at
// corners — e.g. (0.31, 0.42) and (0.312, 0.421). Stroke caps end at
// each wall's exact endpoint, so even a 0.002 gap leaves a visible
// notch in the corner. Snap radius is in fractional units; ~1% of the
// canvas catches all model jitter without merging genuinely separate
// junctions.
const SNAP_RADIUS = 0.012

function snapEndpoints(
  walls: Array<{ a: PolygonPoint; b: PolygonPoint; kind: 'exterior' | 'interior' }>,
): Array<{ a: PolygonPoint; b: PolygonPoint; kind: 'exterior' | 'interior' }> {
  // Greedy union-find on endpoints. Build a list of all 2N endpoints,
  // bucket-sort each into the cluster of its nearest already-seen
  // endpoint within SNAP_RADIUS, then map every wall's endpoints to
  // its cluster's centroid.
  type Cluster = { sumX: number; sumY: number; count: number }
  const clusters: Cluster[] = []
  const endpointToCluster: number[] = []

  const addPoint = (p: PolygonPoint): number => {
    for (let i = 0; i < clusters.length; i++) {
      const c = clusters[i]
      const cx = c.sumX / c.count
      const cy = c.sumY / c.count
      if (Math.hypot(cx - p.x, cy - p.y) < SNAP_RADIUS) {
        c.sumX += p.x
        c.sumY += p.y
        c.count += 1
        return i
      }
    }
    clusters.push({ sumX: p.x, sumY: p.y, count: 1 })
    return clusters.length - 1
  }

  for (const w of walls) {
    endpointToCluster.push(addPoint(w.a))
    endpointToCluster.push(addPoint(w.b))
  }

  return walls.map((w, i) => {
    const ca = clusters[endpointToCluster[i * 2]]
    const cb = clusters[endpointToCluster[i * 2 + 1]]
    return {
      a: { x: ca.sumX / ca.count, y: ca.sumY / ca.count },
      b: { x: cb.sumX / cb.count, y: cb.sumY / cb.count },
      kind: w.kind,
    }
  })
}

function validateSpec(raw: RawSpec, aspectRatio: number): FloorPlanVector | null {
  const rawWalls = (raw.walls ?? [])
    .map((w) => {
      const a = point(w.a)
      const b = point(w.b)
      if (!a || !b) return null
      if (segmentLength(a, b) < 0.01) return null // discard near-zero
      const [a2, b2] = orthogonalize(a, b)
      const kind: 'exterior' | 'interior' =
        w.kind === 'exterior' ? 'exterior' : 'interior'
      return { a: a2, b: b2, kind }
    })
    .filter((w): w is NonNullable<typeof w> => w !== null)
    .slice(0, 200)

  // Snap nearby endpoints together so corners actually close. Then
  // re-orthogonalize: snapping can introduce small tilts on previously
  // axis-aligned walls, and re-snapping keeps the right-angle look.
  const walls = snapEndpoints(rawWalls).map((w) => {
    const [a, b] = orthogonalize(w.a, w.b)
    return { ...w, a, b }
  })

  if (walls.length < 4) return null // a floor plan has at least 4 walls

  // Doors: real doors are 2-12% of canvas. Anything outside that range
  // is a model mistake and would render as a giant useless arc.
  const doors = ((raw.doors ?? []) as RawDoor[])
    .map((d) => {
      const a = point(d.a)
      const b = point(d.b)
      if (!a || !b) return null
      const len = segmentLength(a, b)
      if (len < 0.015 || len > 0.15) return null
      const pivot: 'a' | 'b' = d.pivot === 'b' ? 'b' : 'a'
      const swing: 'cw' | 'ccw' = d.swing === 'ccw' ? 'ccw' : 'cw'
      return { a, b, pivot, swing }
    })
    .filter((d): d is NonNullable<typeof d> => d !== null)
    .slice(0, 30)

  const windows = (raw.windows ?? [])
    .map((w) => {
      const a = point(w.a)
      const b = point(w.b)
      if (!a || !b) return null
      const len = segmentLength(a, b)
      if (len < 0.02 || len > 0.25) return null
      return { a, b }
    })
    .filter((w): w is NonNullable<typeof w> => w !== null)
    .slice(0, 30)

  const room_labels = (raw.room_labels ?? [])
    .map((l) => {
      const at = point(l.at)
      if (!at) return null
      const name = typeof l.name === 'string' ? l.name.trim() : ''
      if (!name) return null
      return { name: name.slice(0, 60), at }
    })
    .filter((l): l is NonNullable<typeof l> => l !== null)
    .slice(0, 30)

  return {
    version: 1,
    aspect_ratio: aspectRatio,
    walls,
    doors,
    windows,
    room_labels,
  }
}

export interface ExtractInput {
  // The image bytes. Any format sharp can read; we re-encode to webp
  // for the vision call.
  buffer: Buffer
}

export interface ExtractResult {
  spec: FloorPlanVector | null
  // For diagnostics — what dimensions we sent to Haiku.
  width: number
  height: number
}

export async function extractFloorPlan(input: ExtractInput): Promise<ExtractResult> {
  const apiKey = env.anthropicApiKey()
  if (!apiKey) return { spec: null, width: 0, height: 0 }

  // Resize + re-encode for the vision call. Keep aspect ratio intact —
  // we use it for rendering downstream.
  const resized = await sharp(input.buffer)
    .rotate() // honour EXIF in case the input bypassed our pipeline
    .resize({
      width: VISION_MAX_WIDTH,
      withoutEnlargement: true,
      fit: 'inside',
    })
    .webp({ quality: 85 })
    .toBuffer({ resolveWithObject: true })

  const { width, height } = resized.info
  const aspectRatio = width / Math.max(1, height)

  const client = new Anthropic({ apiKey })
  const base64 = resized.data.toString('base64')

  const res = await client.messages.create({
    model: VISION_MODEL,
    max_tokens: 8000,
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
  if (!text) return { spec: null, width, height }

  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  let parsed: RawResponse
  try {
    parsed = JSON.parse(cleaned) as RawResponse
  } catch {
    return { spec: null, width, height }
  }
  if (!parsed.found || !parsed.spec) return { spec: null, width, height }

  const spec = validateSpec(parsed.spec, aspectRatio)
  return { spec, width, height }
}
