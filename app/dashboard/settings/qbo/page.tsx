import { requireDesigner } from '@/lib/auth/designer'
import QboManageClient from './QboManageClient'

export default async function QboManagePage() {
  await requireDesigner()
  return <QboManageClient />
}
