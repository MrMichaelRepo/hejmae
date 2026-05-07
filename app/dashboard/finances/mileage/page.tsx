import { requireDesigner } from '@/lib/auth/designer'
import { requirePermission } from '@/lib/auth/permissions'
import { supabaseAdmin } from '@/lib/supabase/server'
import MileageClient from './MileageClient'
import type {
  MileageLogRow,
  MileageRateRow,
  ProjectRow,
} from '@/lib/supabase/types'

export default async function MileagePage() {
  const { designerId, role, permissions } = await requireDesigner()
  requirePermission({ role, permissions }, 'finances:view')
  const sb = supabaseAdmin()

  const [tRes, rRes, pRes] = await Promise.all([
    sb
      .from('mileage_log')
      .select('*')
      .eq('designer_id', designerId)
      .order('trip_date', { ascending: false })
      .order('created_at', { ascending: false }),
    sb
      .from('mileage_rates')
      .select('*')
      .eq('designer_id', designerId)
      .order('year', { ascending: false }),
    sb
      .from('projects')
      .select('*')
      .eq('designer_id', designerId)
      .order('created_at', { ascending: false }),
  ])

  return (
    <MileageClient
      initialTrips={(tRes.data ?? []) as MileageLogRow[]}
      initialRates={(rRes.data ?? []) as MileageRateRow[]}
      initialProjects={(pRes.data ?? []) as ProjectRow[]}
    />
  )
}
