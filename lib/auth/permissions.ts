// Per-member feature gates.
//
// Roles handle structural team management (invite, remove, change roles).
// Per-feature access — e.g. seeing finances, recording payments, managing
// POs — is tracked as a list of permission strings on studio_members.
// Owners always pass every check.
//
// API routes call requirePermission(ctx, 'finances:view') near the top.
// Permissions are intentionally string-typed (not enum-typed) so adding
// a new gate is just: pick a string, gate the route, expose it in the
// team UI. No migration needed.

import { forbidden } from '@/lib/errors'
import type { DesignerContext, StudioRole } from '@/lib/auth/designer'

export type Permission =
  | 'finances:view'
  | 'finances:record_payments'
  | 'finances:manage_invoices'
  | 'po:manage'
  | 'team:manage'

// Roles that bypass permission checks. Owner always; admin can manage team.
const ROLE_BYPASS: Partial<Record<StudioRole, Permission[]>> = {
  owner: [
    'finances:view',
    'finances:record_payments',
    'finances:manage_invoices',
    'po:manage',
    'team:manage',
  ],
  admin: ['team:manage'],
}

export function hasPermission(
  ctx: Pick<DesignerContext, 'role' | 'permissions'>,
  perm: Permission,
): boolean {
  if (ROLE_BYPASS[ctx.role]?.includes(perm)) return true
  return ctx.permissions.includes(perm)
}

export function requirePermission(
  ctx: Pick<DesignerContext, 'role' | 'permissions'>,
  perm: Permission,
): void {
  if (!hasPermission(ctx, perm)) {
    throw forbidden(`Missing permission: ${perm}`)
  }
}

export function requireRole(
  ctx: Pick<DesignerContext, 'role'>,
  ...allowed: StudioRole[]
): void {
  if (!allowed.includes(ctx.role)) {
    throw forbidden(`Requires one of: ${allowed.join(', ')}`)
  }
}
