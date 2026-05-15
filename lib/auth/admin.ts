// Platform-admin gate. Used by every /app/api/admin/* route and every
// /app/admin/* page. The admin role is set manually in the DB (no
// self-serve promotion); this just enforces it at the server boundary.
//
// Returns the resolved designer context plus the admin user id for
// audit fields (resolved_by on duplicate flags, activity logs).

import { forbidden } from '@/lib/errors'
import { requireDesigner, type DesignerContext } from '@/lib/auth/designer'

export interface AdminContext extends DesignerContext {
  adminUserId: string
}

export async function requireAdmin(): Promise<AdminContext> {
  const ctx = await requireDesigner()
  if (ctx.user.role !== 'admin') {
    throw forbidden('Admin access required')
  }
  return { ...ctx, adminUserId: ctx.userId }
}
