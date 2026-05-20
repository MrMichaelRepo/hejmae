import { requireDesigner } from '@/lib/auth/designer'
import QboImportClient from './QboImportClient'

export default async function QboImportPage() {
  await requireDesigner()
  return <QboImportClient />
}
