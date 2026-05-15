import { listDuplicateFlags } from '@/lib/admin/duplicates'
import { supabaseAdmin } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/EmptyState'
import DuplicatesClient from './DuplicatesClient'

export const dynamic = 'force-dynamic'

export default async function AdminDuplicatesPage() {
  // Initial load: unresolved queue. The client takes over after first
  // render for filter / pagination changes.
  const initial = await listDuplicateFlags({
    resolved: false,
    page: 1,
    limit: 20,
  })

  const sb = supabaseAdmin()
  const oneWeekAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString()
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString()

  const [{ count: unresolved }, { count: resolved30 }, { count: newThisWeek }] =
    await Promise.all([
      sb
        .from('catalog_duplicate_flags')
        .select('id', { count: 'exact', head: true })
        .eq('resolved', false),
      sb
        .from('catalog_duplicate_flags')
        .select('id', { count: 'exact', head: true })
        .eq('resolved', true)
        .gte('resolved_at', thirtyDaysAgo),
      sb
        .from('catalog_duplicate_flags')
        .select('id', { count: 'exact', head: true })
        .eq('resolved', false)
        .gte('flagged_at', oneWeekAgo),
    ])

  return (
    <div className="max-w-6xl">
      <PageHeader
        eyebrow="Admin"
        title="Catalog duplicate review"
        subtitle="The weekly scanner surfaces probable duplicates here. Confirm a merge or dismiss the pair — resolved pairs are never re-opened by the scanner."
      />
      <DuplicatesClient
        initial={initial}
        stats={{
          unresolved: unresolved ?? 0,
          resolved30: resolved30 ?? 0,
          newThisWeek: newThisWeek ?? 0,
        }}
      />
    </div>
  )
}
