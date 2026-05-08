import { requireDesigner } from '@/lib/auth/designer'
import { withSignedUrls } from '@/lib/storage'
import SettingsClient from './SettingsClient'
import type { DesignerUser } from '@/lib/types-ui'

export default async function SettingsPage() {
  const { user } = await requireDesigner()
  const signed = await withSignedUrls(user, ['logo_url'] as const)
  return <SettingsClient initialUser={signed as DesignerUser} />
}
