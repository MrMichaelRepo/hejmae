'use client'

// Renders a FloorPlanVector spec as a clean SVG floor plan in the
// Hejmae visual language.
//
// Coordinate system:
//   The spec stores all points as 0..1 fractions of the source image's
//   width and height. To render geometry truthfully (so a 90° corner
//   actually appears as 90°, and a door arc actually appears as a
//   circle), the SVG uses viewBox "0 0 ${aspect} 1" where aspect is
//   width/height of the source. We multiply spec.x by aspect when we
//   place points; spec.y stays as-is.
//
//   The wrapping <div> sets `aspect-ratio: ${aspect}` so the SVG fills
//   it without letterboxing. Pin and room overlays in FloorPlanClient
//   continue to use 0..1 CSS percentages — those don't go through this
//   SVG, so the coord-system change here doesn't affect them.
//
// Visual language:
//   - Background: pure white (paper)
//   - Exterior walls: 5px solid, near-black, miter-joined
//   - Interior walls: 2.5px solid, near-black, miter-joined
//   - Doors:          a thin leaf line + thin 90° swing arc
//   - Windows:        three parallel hairlines across the opening
//   - Room labels:    tracked uppercase sans-serif (Hejmae caption style)

import type { FloorPlanVector, PolygonPoint } from '@/lib/types-ui'

interface Props {
  spec: FloorPlanVector
  className?: string
  paper?: boolean
}

const COLOR_WALL = '#1e2128'
const COLOR_OPENING = '#1e2128'
const SW_EXTERIOR = 5
const SW_INTERIOR = 2.5
const SW_OPENING = 1
const SW_HAIRLINE = 0.75

export default function VectorView({ spec, className, paper = true }: Props) {
  const aspect = spec.aspect_ratio
  // Convert a 0..1 fractional point into the SVG's viewBox coords
  // (x scaled by aspect, y unchanged). Returns plain numbers so JSX
  // attribute interpolation is cheap.
  const vx = (p: PolygonPoint) => p.x * aspect
  const vy = (p: PolygonPoint) => p.y

  return (
    <div
      className={className}
      style={{
        aspectRatio: aspect,
        background: paper ? '#ffffff' : 'transparent',
      }}
    >
      <svg
        viewBox={`0 0 ${aspect} 1`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full block"
        // shape-rendering hints crisp thin lines on retina without
        // smudging miter corners.
        shapeRendering="geometricPrecision"
      >
        {/* Walls — drawn in two passes so exterior walls render on top
            of any interior walls that touch them at junctions. */}
        {spec.walls
          .filter((w) => w.kind !== 'exterior')
          .map((w, i) => (
            <line
              key={`wi-${i}`}
              x1={vx(w.a)}
              y1={vy(w.a)}
              x2={vx(w.b)}
              y2={vy(w.b)}
              fill="none"
              stroke={COLOR_WALL}
              strokeWidth={SW_INTERIOR}
              strokeLinecap="butt"
              strokeLinejoin="miter"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        {spec.walls
          .filter((w) => w.kind === 'exterior')
          .map((w, i) => (
            <line
              key={`we-${i}`}
              x1={vx(w.a)}
              y1={vy(w.a)}
              x2={vx(w.b)}
              y2={vy(w.b)}
              fill="none"
              stroke={COLOR_WALL}
              strokeWidth={SW_EXTERIOR}
              strokeLinecap="butt"
              strokeLinejoin="miter"
              vectorEffect="non-scaling-stroke"
            />
          ))}

        {/* Windows — three parallel hairlines across the opening, with
            short perpendicular end caps that sit at the wall edge.
            The middle line is slightly heavier so it reads as the
            window centerline. */}
        {spec.windows.map((win, i) => {
          const ax = vx(win.a)
          const ay = vy(win.a)
          const bx = vx(win.b)
          const by = vy(win.b)
          const len = Math.hypot(bx - ax, by - ay)
          if (len < 0.012 || len > 0.3) return null
          // Unit perpendicular in physical viewBox units.
          const nx = -(by - ay) / len
          const ny = (bx - ax) / len
          // Half-width of the window glyph — matches the exterior wall
          // thickness visually so the window "fits" the wall.
          const off = 0.014
          return (
            <g key={`win-${i}`}>
              {/* Outer rails */}
              <line
                x1={ax + nx * off}
                y1={ay + ny * off}
                x2={bx + nx * off}
                y2={by + ny * off}
                fill="none"
                stroke={COLOR_OPENING}
                strokeWidth={SW_HAIRLINE}
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={ax - nx * off}
                y1={ay - ny * off}
                x2={bx - nx * off}
                y2={by - ny * off}
                fill="none"
                stroke={COLOR_OPENING}
                strokeWidth={SW_HAIRLINE}
                vectorEffect="non-scaling-stroke"
              />
              {/* Centerline */}
              <line
                x1={ax}
                y1={ay}
                x2={bx}
                y2={by}
                fill="none"
                stroke={COLOR_OPENING}
                strokeWidth={SW_OPENING}
                vectorEffect="non-scaling-stroke"
              />
              {/* End caps perpendicular to the wall, snapping the
                  three rails together. */}
              <line
                x1={ax + nx * off}
                y1={ay + ny * off}
                x2={ax - nx * off}
                y2={ay - ny * off}
                fill="none"
                stroke={COLOR_OPENING}
                strokeWidth={SW_HAIRLINE}
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={bx + nx * off}
                y1={by + ny * off}
                x2={bx - nx * off}
                y2={by - ny * off}
                fill="none"
                stroke={COLOR_OPENING}
                strokeWidth={SW_HAIRLINE}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )
        })}

        {/* Doors — leaf line + 90° swing arc. */}
        {spec.doors.map((d, i) => {
          const pivotPt = d.pivot === 'b' ? d.b : d.a
          const tipPt = d.pivot === 'b' ? d.a : d.b
          const px = vx(pivotPt)
          const py = vy(pivotPt)
          const tx = vx(tipPt)
          const ty = vy(tipPt)
          const dx = tx - px
          const dy = ty - py
          const r = Math.hypot(dx, dy)
          if (r < 0.012 || r > 0.18) return null
          // 90° rotation of (dx, dy):  CW → (dy, -dx),  CCW → (-dy, dx)
          const ccw = d.swing === 'ccw'
          const ex = px + (ccw ? -dy : dy)
          const ey = py + (ccw ? dx : -dx)
          const sweep = ccw ? 0 : 1
          return (
            <g key={`door-${i}`}>
              {/* Door leaf */}
              <line
                x1={px}
                y1={py}
                x2={tx}
                y2={ty}
                fill="none"
                stroke={COLOR_OPENING}
                strokeWidth={SW_OPENING}
                strokeLinecap="butt"
                vectorEffect="non-scaling-stroke"
              />
              {/* 90° swing arc — drawn hairline so it reads as a
                  reference symbol, not a structural element. */}
              <path
                d={`M ${tx} ${ty} A ${r} ${r} 0 0 ${sweep} ${ex} ${ey}`}
                fill="none"
                stroke={COLOR_OPENING}
                strokeWidth={SW_HAIRLINE}
                strokeLinecap="butt"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )
        })}

        {/* Room labels */}
        {(spec.room_labels ?? []).map((l, i) => (
          <foreignObject
            key={`l-${i}`}
            x={vx(l.at) - aspect * 0.12}
            y={vy(l.at) - 0.025}
            width={aspect * 0.24}
            height={0.05}
            style={{ pointerEvents: 'none', overflow: 'visible' }}
          >
            <div className="flex items-center justify-center w-full h-full">
              <span className="font-sans text-[11px] uppercase tracking-[0.22em] text-hm-text whitespace-nowrap">
                {l.name}
              </span>
            </div>
          </foreignObject>
        ))}
      </svg>
    </div>
  )
}
