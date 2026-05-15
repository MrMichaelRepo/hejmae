import { listAdminCatalog } from '@/lib/admin/catalog'
import { PageHeader } from '@/components/ui/EmptyState'
import CatalogAdminClient from './CatalogAdminClient'

export const dynamic = 'force-dynamic'

export default async function AdminCatalogPage() {
  const initial = await listAdminCatalog({
    page: 1,
    limit: 50,
    include_merged: false,
  })

  return (
    <div className="max-w-7xl">
      <PageHeader
        eyebrow="Admin"
        title="Catalog management"
        subtitle="Search, edit, and curate every product across the master catalog. Flag duplicates the scanner missed and clean up bad scrape data."
      />
      <CatalogAdminClient initial={initial} />
    </div>
  )
}
