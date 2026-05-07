import { requireDesigner } from '@/lib/auth/designer'
import SettingsClient from './SettingsClient'
import type { DesignerUser } from '@/lib/types-ui'

export default async function SettingsPage() {
  const { user } = await requireDesigner()
  return <SettingsClient initialUser={user as DesignerUser} />
}
