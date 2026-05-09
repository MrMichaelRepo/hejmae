import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { getStudioFinanceSettings } from '@/lib/finances/studio_settings'
import FinanceSettingsClient from './FinanceSettingsClient'

export default async function FinanceSettingsPage() {
  const ctx = await requireDesigner()
  requirePermission(ctx, 'finances:view')
  const settings = await getStudioFinanceSettings(ctx.studioId)
  const canEdit =
    ctx.role === 'owner' ||
    ctx.permissions.includes('finances:manage_settings')
  return (
    <FinanceSettingsClient initial={settings} canEdit={canEdit} />
  )
}
