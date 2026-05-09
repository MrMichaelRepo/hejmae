import { requireDesigner } from '@/lib/auth/designer'
import { hasPermission, requirePermission } from '@/lib/auth/permissions'
import TimeNav from './TimeNav'

export default async function TimeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const ctx = await requireDesigner()
  requirePermission(ctx, 'time:log')
  const showTeam = hasPermission(ctx, 'time:view_all')
  return (
    <div className="max-w-6xl">
      <TimeNav showTeam={showTeam} />
      {children}
    </div>
  )
}
