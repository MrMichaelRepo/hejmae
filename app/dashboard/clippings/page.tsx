import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withSignedUrlsList } from '@/lib/storage'
import ClippingsClient, {
  type ClippingsFilterOption,
} from './ClippingsClient'

export default async function ClippingsPage() {
  const { designerId, userId, studioId } = await requireDesigner()

  // Build filter options server-side from data the studio has already
  // accumulated. Distinct queries are cheap on the indexed columns.
  const sb = supabaseAdmin()

  const [teammatesRes, projectsRes, distinctRes] = await Promise.all([
    // Studio teammates (people who could have clipped something).
    sb
      .from('studio_members')
      .select('user:users!inner(id, name, email, logo_url)')
      .eq('studio_id', studioId),
    // Active projects only — that's what designers would tag a clipping with.
    sb
      .from('projects')
      .select('id, name')
      .eq('designer_id', designerId)
      .eq('status', 'active')
      .order('name'),
    // Pull just enough rows to derive brand / item_type / week_added
    // filter options. We cap at 500 — beyond that the filter chips
    // become noise anyway.
    sb
      .from('clipping_items')
      .select('brand, item_type, week_added')
      .eq('designer_id', designerId)
      .is('deleted_at', null)
      .limit(500),
  ])

  type TeammateRow = { user: { id: string; name: string | null; email: string; logo_url: string | null } }
  const teammates = ((teammatesRes.data ?? []) as unknown as TeammateRow[]).map(
    (m) => m.user,
  )
  const teammatesSigned = await withSignedUrlsList(teammates, 'logo_url')

  const distinctBrands = new Set<string>()
  const distinctItemTypes = new Set<string>()
  const distinctWeeks = new Set<string>()
  for (const r of distinctRes.data ?? []) {
    if (r.brand) distinctBrands.add(r.brand)
    if (r.item_type) distinctItemTypes.add(r.item_type)
    if (r.week_added) distinctWeeks.add(r.week_added)
  }

  const brandOptions: ClippingsFilterOption[] = Array.from(distinctBrands)
    .sort()
    .map((v) => ({ value: v, label: v }))
  const itemTypeOptions: ClippingsFilterOption[] = Array.from(distinctItemTypes)
    .sort()
    .map((v) => ({ value: v, label: v }))
  const weekOptions = Array.from(distinctWeeks).sort().reverse()

  return (
    <ClippingsClient
      currentUserId={userId}
      teammates={teammatesSigned.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        logo_url: u.logo_url,
      }))}
      projects={(projectsRes.data ?? []) as Array<{ id: string; name: string }>}
      brandOptions={brandOptions}
      itemTypeOptions={itemTypeOptions}
      weekOptions={weekOptions}
    />
  )
}
