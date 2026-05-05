import { z } from 'zod'

const role = z.enum(['admin', 'member'])

const permission = z.enum([
  'finances:view',
  'finances:record_payments',
  'finances:manage_invoices',
  'po:manage',
  'team:manage',
])

export const createInvite = z.object({
  email: z.string().email().toLowerCase(),
  role: role.default('member'),
  permissions: z.array(permission).default([]),
})

export const updateMember = z.object({
  // Role can be downgraded/upgraded among admin/member; ownership transfer
  // is a separate flow.
  role: role.optional(),
  permissions: z.array(permission).optional(),
})

export const acceptInvite = z.object({
  token: z.string().min(10),
})
