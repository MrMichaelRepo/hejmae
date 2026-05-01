import { z } from 'zod'
import { uuid } from './common'

export const createProposal = z.object({
  room_ids: z.array(uuid).min(1),
})

export const updateProposal = z.object({
  room_ids: z.array(uuid).optional(),
  client_notes: z.string().max(10_000).nullish(),
})

export const portalApproveRoom = z.object({
  client_comment: z.string().max(5_000).nullish(),
})
