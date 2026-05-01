import { z } from 'zod'

export const createRoom = z.object({
  name: z.string().min(1).max(200),
  floor_plan_x: z.number().nullish(),
  floor_plan_y: z.number().nullish(),
  floor_plan_width: z.number().nullish(),
  floor_plan_height: z.number().nullish(),
  position: z.number().int().min(0).optional(),
})

export const updateRoom = createRoom.partial()
