import { z } from 'zod'

export const uuid = z.string().uuid()
export const moneyCents = z
  .number()
  .int()
  .nonnegative()
  .max(1_000_000_000_00) // $1B sanity cap
export const percent = z.number().min(0).max(1000)
