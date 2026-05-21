'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { PageHeader } from '@/components/ui/EmptyState'
import EmptyState from '@/components/ui/EmptyState'
import ClippingsEmpty from '@/components/ui/empty/ClippingsEmpty'
import { SkeletonGrid } from '@/components/ui/Skeleton'
import Button from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import { formatWeekRange } from '@/lib/clippings/week'
import ClippingCard from './ClippingCard'
import AddClippingToProjectModal from './AddClippingToProjectModal'
import BulkAddToProjectModal from './BulkAddToProjectModal'
import { formatCents } from '@/lib/format'
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
  brandOptions: ClippingsFilterOption[]
  itemTypeOptions: ClippingsFilterOption[]
  // Pre-sorted desc list of Monday ISO dates the studio has clippings for.
  weekOptions: string[]
}

interface Filters {
  designerId: string
  weekAdded: string
  brand: string
  itemType: string
  projectId: string
}

const EMPTY_FILTERS: Filters = {
  designerId: '',
  weekAdded: '',
  brand: '',
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
  brandOptions,
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

  // Bulk selection mode. Toggling off clears any selected ids so the
  // next entry starts fresh.
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkModalOpen, setBulkModalOpen] = useState(false)

  const toggleSelectMode = () => {
    setSelectMode((prev) => {
      if (prev) setSelectedIds(new Set())
      return !prev
    })
  }

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Sum the retail price of selected rows. Rows still missing a price
  // contribute 0 — the total is "best known", not authoritative.
  const selectionTotalCents = useMemo(() => {
    if (!rows || selectedIds.size === 0) return 0
    let sum = 0
    for (const r of rows) {
      if (selectedIds.has(r.id) && r.retail_price_cents != null) {
        sum += r.retail_price_cents
      }
    }
    return sum
  }, [rows, selectedIds])

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
      if (filters.brand) params.set('brand', filters.brand)
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
    <div className={['max-w-7xl', selectMode ? 'pb-24' : ''].join(' ')}>
      <PageHeader
        eyebrow="Sourcing"
        title="Clippings"
        subtitle="Everything your studio has clipped from the web. Promote a clipping to a project when you're ready to spec it."
      />

      <div className="flex items-start justify-between gap-4 mb-2">
        <FilterBar
          filters={filters}
          onChange={setFilters}
          teammates={teammates}
          projects={projects}
          brandOptions={brandOptions}
          itemTypeOptions={itemTypeOptions}
          weekOptions={weekOptions}
        />
        <button
          onClick={toggleSelectMode}
          className={[
            'shrink-0 font-sans text-[10px] uppercase tracking-[0.22em] px-4 py-2 rounded-full border transition-colors',
            selectMode
              ? 'bg-ink text-bg border-ink'
              : 'bg-transparent text-ink border-line-strong hover:border-ink',
          ].join(' ')}
        >
          {selectMode ? 'Cancel selection' : 'Select'}
        </button>
      </div>

      {pendingDeletes.length > 0 ? (
        <div className="mb-6 flex flex-col gap-2">
          {pendingDeletes.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between border border-line bg-ink/[0.03] px-4 py-2.5"
            >
              <div className="font-garamond text-[0.95rem] text-ink-muted">
                Removed “{p.row.name ?? 'clipping'}”
              </div>
              <button
                onClick={() => handleUndo(p.id)}
                className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink hover:underline"
              >
                Undo
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {rows === null ? (
        <SkeletonGrid count={9} />
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
          <ClippingsEmpty />
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
                selectMode={selectMode}
                selected={selectedIds.has(row.id)}
                onToggleSelect={() => toggleSelected(row.id)}
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

      {/* Sticky selection footer — fixed to viewport bottom while
          select mode is on. Padding is generous because the page grid
          extends underneath. */}
      {selectMode ? (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-bg border-t border-line shadow-[0_-2px_12px_rgba(30,33,40,0.08)]">
          <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between gap-4">
            <div className="flex items-baseline gap-4">
              <div className="font-serif text-[1.05rem] text-ink">
                {selectedIds.size} selected
              </div>
              <div className="font-garamond text-[0.95rem] text-ink-muted">
                Total: {formatCents(selectionTotalCents)}
              </div>
            </div>
            <Button
              onClick={() => setBulkModalOpen(true)}
              disabled={selectedIds.size === 0}
            >
              Add {selectedIds.size > 0 ? selectedIds.size : ''} to project
            </Button>
          </div>
        </div>
      ) : null}

      <BulkAddToProjectModal
        open={bulkModalOpen}
        selectedCount={selectedIds.size}
        totalCents={selectionTotalCents}
        selectedIds={Array.from(selectedIds)}
        projects={projects}
        onClose={() => setBulkModalOpen(false)}
        onAdded={(ok) => {
          setBulkModalOpen(false)
          if (ok > 0) {
            // Refresh the feed and exit select mode after a successful
            // bulk add. The cards stay in place but the user can see
            // them tagged with the project on next reload.
            setSelectedIds(new Set())
            setSelectMode(false)
            fetchPage(1, false).catch(() => {})
          }
        }}
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
  brandOptions,
  itemTypeOptions,
  weekOptions,
}: {
  filters: Filters
  onChange: (next: Filters) => void
  teammates: Teammate[]
  projects: Array<{ id: string; name: string }>
  brandOptions: ClippingsFilterOption[]
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
        label="Brand"
        value={filters.brand}
        onChange={(v) => set('brand', v)}
        options={brandOptions}
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
          className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted hover:text-ink px-3 py-2"
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
        'inline-flex items-center gap-2 border rounded-sm pl-3 pr-2 py-2 transition-colors',
        isActive
          ? 'border-accent text-ink bg-accent-soft/40'
          : 'border-line text-ink-muted hover:border-line-strong hover:text-ink',
      ].join(' ')}
    >
      <span className="font-sans text-[10px] uppercase tracking-[0.22em]">
        {label}
      </span>
      <span className="relative inline-flex items-center">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="bg-transparent appearance-none font-garamond text-[0.9rem] text-ink pr-5 focus:outline-none cursor-pointer disabled:cursor-not-allowed"
          disabled={options.length === 0}
        >
          <option value="">All</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <svg
          aria-hidden
          viewBox="0 0 12 8"
          className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 w-3 h-2 text-ink-subtle"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M1 1.5l5 5 5-5" />
        </svg>
      </span>
    </label>
  )
}
