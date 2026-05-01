import { z } from 'zod'

export const createClient = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().nullish(),
  phone: z.string().max(50).nullish(),
  notes: z.string().max(10_000).nullish(),
})

export const updateClient = createClient.partial()
