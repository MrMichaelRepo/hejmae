import { z } from 'zod'

// Polygon: array of {x,y} points in 0..1 image-fraction coords. Min 3 to
// form a closed shape. Capped at 64 to keep payloads sane.
const polygonPoint = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
})
export const polygonShape = z.array(polygonPoint).min(3).max(64)

export const createRoom = z.object({
  name: z.string().min(1).max(200),
  // Legacy rectangle fields — accepted for back-compat.
  floor_plan_x: z.number().nullish(),
  floor_plan_y: z.number().nullish(),
  floor_plan_width: z.number().nullish(),
  floor_plan_height: z.number().nullish(),
  // Preferred: polygon points.
  floor_plan_polygon: polygonShape.nullish(),
  position: z.number().int().min(0).optional(),
})

export const updateRoom = createRoom.partial()
