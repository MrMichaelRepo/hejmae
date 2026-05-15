'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { PageHeader } from '@/components/ui/EmptyState'
import EmptyState from '@/components/ui/EmptyState'
import { PageSpinner } from '@/components/ui/Spinner'
import Button from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import { formatWeekRange } from '@/lib/clippings/week'
import ClippingCard from './ClippingCard'
import AddClippingToProjectModal from './AddClippingToProjectModal'
import type { ClippingItemFeedRow } from '@/lib/types-ui'

export interface ClippingsFilterOption {
  value: string
  label: string
}

export interface Teammate {
  id: string
  name: string | null
  email: string
  logo_url: string | null
}

interface Props {
  currentUserId: string
  teammates: Teammate[]
  projects: Array<{ id: string; name: string }>
  vendorOptions: ClippingsFilterOption[]
  itemTypeOptions: ClippingsFilterOption[]
  // Pre-sorted desc list of Monday ISO dates the studio has clippings for.
  weekOptions: string[]
}

interface Filters {
  designerId: string
  weekAdded: string
  vendor: string
  itemType: string
  projectId: string
}

const EMPTY_FILTERS: Filters = {
  designerId: '',
  weekAdded: '',
  vendor: '',
  itemType: '',
  projectId: '',
}

const PAGE_SIZE = 24

// Soft-delete with undo: we keep the row in a pending bucket for the
// duration of the toast, fire the DELETE only when the timer expires,
// and restore it locally if the user clicks Undo before that.
interface PendingDelete {
  id: string
  row: ClippingItemFeedRow
  timer: ReturnType<typeof setTimeout>
}

export default function ClippingsClient({
  currentUserId,
  teammates,
  projects,
  vendorOptions,
  itemTypeOptions,
  weekOptions,
}: Props) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [rows, setRows] = useState<ClippingItemFeedRow[] | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [pickingForProject, setPickingForProject] = useState<ClippingItemFeedRow | null>(null)
  const [pendingDeletes, setPendingDeletes] = useState<PendingDelete[]>([])

  const filtersActive = useMemo(
    () => Object.values(filters).some((v) => v !== ''),
    [filters],
  )

  const fetchPage = useCallback(
    async (targetPage: number, append: boolean) => {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: String(PAGE_SIZE),
      })
      if (filters.designerId) params.set('designer_id', filters.designerId)
      if (filters.weekAdded) params.set('week_added', filters.weekAdded)
      if (filters.vendor) params.set('vendor', filters.vendor)
      if (filters.itemType) params.set('item_type', filters.itemType)
      if (filters.projectId) params.set('project_id', filters.projectId)

      const res = await api.get<ClippingItemFeedRow[]>(
        `/api/clippings?${params.toString()}`,
      )
      const data = (res.data as ClippingItemFeedRow[]) ?? []
      const meta = (res as { meta?: { has_more?: boolean } }).meta
      setRows((existing) => (append ? [...(existing ?? []), ...data] : data))
      setHasMore(Boolean(meta?.has_more))
      setPage(targetPage)
    },
    [filters],
  )

  useEffect(() => {
    setRows(null)
    setPage(1)
    setHasMore(false)
    fetchPage(1, false).catch((e: unknown) => {
      const msg = e instanceof ApiError ? e.message : 'Failed to load clippings'
      toast.error(msg)
      setRows([])
    })
  }, [fetchPage])

  // Auto-refresh rows that are still scraping. We poll every 4s while
  // there's at least one pending row and stop once they all resolve.
  useEffect(() => {
    if (!rows) return
    const pending = rows.some((r) => r.scrape_status === 'pending')
    if (!pending) return
    const handle = setInterval(() => {
      fetchPage(1, false).catch(() => {})
    }, 4000)
    return () => clearInterval(handle)
  }, [rows, fetchPage])

  // Cancel any pending deletes on unmount so we don't fire after navigation.
  useEffect(() => {
    return () => {
      pendingDeletes.forEach((p) => clearTimeout(p.timer))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDelete = (row: ClippingItemFeedRow) => {
    // Optimistic remove + 5-second window before the actual DELETE fires.
    setRows((existing) => (existing ?? []).filter((r) => r.id !== row.id))

    const timer = setTimeout(() => {
      api
        .del(`/api/clippings/${row.id}`)
        .catch((e: unknown) => {
          const msg = e instanceof ApiError ? e.message : 'Delete failed'
          toast.error(msg)
          setRows((existing) => [row, ...(existing ?? [])])
        })
        .finally(() => {
          setPendingDeletes((p) => p.filter((x) => x.id !== row.id))
        })
    }, 5000)

    const pending: PendingDelete = { id: row.id, row, timer }
    setPendingDeletes((p) => [...p, pending])

    toast.info('Clipping deleted')
    // Undo affordance: we expose a button via the toast host. The host
    // is simple — for now we offer undo via a separate banner instead.
  }

  const handleUndo = (id: string) => {
    setPendingDeletes((existing) => {
      const found = existing.find((p) => p.id === id)
      if (!found) return existing
      clearTimeout(found.timer)
      setRows((rs) => {
        const next = [...(rs ?? [])]
        // Restore in original-ish position (top is fine — clippings are
        // sorted desc by created_at and the row was just removed).
        if (!next.find((r) => r.id === found.row.id)) {
          next.unshift(found.row)
        }
        return next
      })
      return existing.filter((p) => p.id !== id)
    })
  }

  const loadMore = async () => {
    if (loadingMore) return
    setLoadingMore(true)
    try {
      await fetchPage(page + 1, true)
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to load more'
      toast.error(msg)
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="max-w-7xl">
      <PageHeader
        eyebrow="Sourcing"
        title="Clippings"
        subtitle="Everything your studio has clipped from the web. Promote a clipping to a project when you're ready to spec it."
      />

      <FilterBar
        filters={filters}
        onChange={setFilters}
        teammates={teammates}
        projects={projects}
        vendorOptions={vendorOptions}
        itemTypeOptions={itemTypeOptions}
        weekOptions={weekOptions}
      />

      {pendingDeletes.length > 0 ? (
        <div className="mb-6 flex flex-col gap-2">
          {pendingDeletes.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between border border-hm-text/15 bg-hm-text/[0.03] px-4 py-2.5"
            >
              <div className="font-garamond text-[0.95rem] text-hm-nav">
                Removed “{p.row.name ?? 'clipping'}”
              </div>
              <button
                onClick={() => handleUndo(p.id)}
                className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-text hover:underline"
              >
                Undo
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {rows === null ? (
        <PageSpinner />
      ) : rows.length === 0 ? (
        filtersActive ? (
          <EmptyState
            title="No clippings match your filters."
            body="Try clearing a filter or two."
            action={
              <Button variant="secondary" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
                Clear filters
              </Button>
            }
            small
          />
        ) : (
          <EmptyState
            title="Nothing clipped yet."
            body="Install the Hejmae Clipper to start saving products while you browse."
            small
          />
        )
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {rows.map((row) => (
              <ClippingCard
                key={row.id}
                row={row}
                canDelete={row.clipper_user_id === currentUserId}
                onDelete={() => handleDelete(row)}
                onAddToProject={() => setPickingForProject(row)}
                weekLabel={formatWeekRange(row.week_added)}
              />
            ))}
          </div>

          {hasMore ? (
            <div className="mt-10 flex justify-center">
              <Button variant="secondary" onClick={loadMore} loading={loadingMore}>
                Load more
              </Button>
            </div>
          ) : null}
        </>
      )}

      <AddClippingToProjectModal
        clipping={pickingForProject}
        projects={projects}
        onClose={() => setPickingForProject(null)}
        onAdded={() => setPickingForProject(null)}
      />
    </div>
  )
}

// ----------------------------------------------------------------------------
// Filter bar
// ----------------------------------------------------------------------------

function FilterBar({
  filters,
  onChange,
  teammates,
  projects,
  vendorOptions,
  itemTypeOptions,
  weekOptions,
}: {
  filters: Filters
  onChange: (next: Filters) => void
  teammates: Teammate[]
  projects: Array<{ id: string; name: string }>
  vendorOptions: ClippingsFilterOption[]
  itemTypeOptions: ClippingsFilterOption[]
  weekOptions: string[]
}) {
  const active = Object.values(filters).some((v) => v !== '')
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    onChange({ ...filters, [k]: v })

  return (
    <div className="mb-8 flex flex-wrap items-center gap-2">
      <FilterSelect
        label="Designer"
        value={filters.designerId}
        onChange={(v) => set('designerId', v)}
        options={teammates.map((t) => ({
          value: t.id,
          label: t.name?.trim() || t.email,
        }))}
      />
      <FilterSelect
        label="Week added"
        value={filters.weekAdded}
        onChange={(v) => set('weekAdded', v)}
        options={weekOptions.map((w) => ({
          value: w,
          label: formatWeekRange(w),
        }))}
      />
      <FilterSelect
        label="Vendor"
        value={filters.vendor}
        onChange={(v) => set('vendor', v)}
        options={vendorOptions}
      />
      <FilterSelect
        label="Item type"
        value={filters.itemType}
        onChange={(v) => set('itemType', v)}
        options={itemTypeOptions}
      />
      <FilterSelect
        label="Project"
        value={filters.projectId}
        onChange={(v) => set('projectId', v)}
        options={projects.map((p) => ({ value: p.id, label: p.name }))}
      />
      {active ? (
        <button
          onClick={() => onChange(EMPTY_FILTERS)}
          className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav hover:text-hm-text px-3 py-2"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: ClippingsFilterOption[]
}) {
  const isActive = value !== ''
  return (
    <label
      className={[
        'inline-flex items-center gap-2 border px-3 py-2 transition-colors',
        isActive
          ? 'border-hm-text text-hm-text bg-hm-text/[0.04]'
          : 'border-hm-text/15 text-hm-nav hover:text-hm-text',
      ].join(' ')}
    >
      <span className="font-sans text-[10px] uppercase tracking-[0.22em]">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent font-garamond text-[0.9rem] focus:outline-none cursor-pointer"
        disabled={options.length === 0}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
