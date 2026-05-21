'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { api, ApiError } from '@/lib/api'
import { formatCents } from '@/lib/format'
import { Input } from '@/components/ui/Input'
import { Checkbox } from '@/components/ui/Checkbox'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import { toast } from '@/components/ui/Toast'
import EditDrawer from './EditDrawer'
import CompareModal from './CompareModal'
import FlagDuplicatePopover from './FlagDuplicatePopover'
import type { AdminCatalogResult, AdminCatalogRow } from '@/lib/admin/catalog'

type Trinary = 'yes' | 'no' | ''

export default function CatalogAdminClient({
  initial,
}: {
  initial: AdminCatalogResult
}) {
  const [q, setQ] = useState('')
  const [vendor, setVendor] = useState('')
  const [itemType, setItemType] = useState('')
  const [hasImage, setHasImage] = useState<Trinary>('')
  const [hasPrice, setHasPrice] = useState<Trinary>('')
  const [flagged, setFlagged] = useState<Trinary>('')
  const [includeMerged, setIncludeMerged] = useState(false)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<AdminCatalogResult>(initial)
  const [loading, setLoading] = useState(false)

  const [editing, setEditing] = useState<AdminCatalogRow | null>(null)
  const [flaggingFor, setFlaggingFor] = useState<AdminCatalogRow | null>(null)
  const [selected, setSelected] = useState<AdminCatalogRow[]>([])
  const [comparing, setComparing] = useState<
    [AdminCatalogRow, AdminCatalogRow] | null
  >(null)

  const skipInitial = useRef(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      if (vendor.trim()) params.set('vendor', vendor.trim())
      if (itemType.trim()) params.set('item_type', itemType.trim())
      if (hasImage) params.set('has_image', hasImage)
      if (hasPrice) params.set('has_price', hasPrice)
      if (flagged) params.set('flagged', flagged)
      if (includeMerged) params.set('include_merged', 'true')
      params.set('page', String(page))
      params.set('limit', '50')
      const res = await api.get<AdminCatalogResult>(
        `/api/admin/catalog?${params.toString()}`,
      )
      if (res.data) setData(res.data)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [q, vendor, itemType, hasImage, hasPrice, flagged, includeMerged, page])

  useEffect(() => {
    if (skipInitial.current) {
      skipInitial.current = false
      return
    }
    const t = setTimeout(() => void fetchData(), 300)
    return () => clearTimeout(t)
  }, [fetchData])

  const toggleSelect = (row: AdminCatalogRow) => {
    setSelected((prev) => {
      if (prev.some((r) => r.id === row.id)) {
        return prev.filter((r) => r.id !== row.id)
      }
      if (prev.length >= 2) return prev
      return [...prev, row]
    })
  }

  const clearSelection = () => setSelected([])

  const onSaved = (saved: AdminCatalogRow) => {
    setData((prev) => ({
      ...prev,
      items: prev.items.map((r) => (r.id === saved.id ? { ...r, ...saved } : r)),
    }))
    setEditing(null)
    toast.success('Saved')
  }

  return (
    <div>
      {/* ── Search ───────────────────────────────────────────────── */}
      <div className="mb-3">
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(1)
          }}
          placeholder="Search name, vendor, URL, description…"
        />
      </div>

      {/* ── Filters ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <FilterInput
          value={itemType}
          onChange={(v) => {
            setItemType(v)
            setPage(1)
          }}
          placeholder="Type"
        />
        <FilterInput
          value={vendor}
          onChange={(v) => {
            setVendor(v)
            setPage(1)
          }}
          placeholder="Vendor"
        />
        <TrinaryChip
          label="Has image"
          value={hasImage}
          onChange={(v) => {
            setHasImage(v)
            setPage(1)
          }}
        />
        <TrinaryChip
          label="Has price"
          value={hasPrice}
          onChange={(v) => {
            setHasPrice(v)
            setPage(1)
          }}
        />
        <TrinaryChip
          label="Flagged"
          value={flagged}
          onChange={(v) => {
            setFlagged(v)
            setPage(1)
          }}
        />
        <Checkbox
          className="ml-2"
          checked={includeMerged}
          onChange={(e) => {
            setIncludeMerged(e.target.checked)
            setPage(1)
          }}
          label={
            <span className="font-sans text-[10px] uppercase tracking-[0.2em] text-ink-muted">
              Show merged
            </span>
          }
        />
        <div className="ml-auto font-sans text-[10px] uppercase tracking-[0.2em] text-ink-muted">
          {data.total} total
        </div>
      </div>

      {loading ? (
        <PageSpinner />
      ) : data.items.length === 0 ? (
        <EmptyState
          title="No matches"
          body="Try a broader search or relax the filters."
          small
        />
      ) : (
        <div className="border border-line">
          <table className="w-full font-garamond text-[0.9rem]">
            <thead className="bg-ink/[0.03] text-left font-sans text-[10px] uppercase tracking-[0.18em] text-ink-muted">
              <tr>
                <th className="px-3 py-2.5 w-8"></th>
                <th className="px-3 py-2.5 w-12"></th>
                <th className="px-3 py-2.5">Name</th>
                <th className="px-3 py-2.5">Vendor</th>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Price</th>
                <th className="px-3 py-2.5">Clips</th>
                <th className="px-3 py-2.5">Created</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-line hover:bg-ink/[0.03]"
                >
                  <td className="px-3 py-2.5">
                    <Checkbox
                      checked={selected.some((r) => r.id === row.id)}
                      onChange={() => toggleSelect(row)}
                      disabled={
                        selected.length >= 2 &&
                        !selected.some((r) => r.id === row.id)
                      }
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="w-10 h-10 bg-ink/[0.05] relative overflow-hidden">
                      {row.image_url ? (
                        <Image
                          src={row.image_url}
                          alt=""
                          fill
                          sizes="40px"
                          className="object-cover"
                          unoptimized
                        />
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => setEditing(row)}
                      className="text-left hover:underline underline-offset-2 line-clamp-2"
                    >
                      {row.name}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-ink-muted">
                    {row.vendor ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 text-ink-muted">
                    {row.item_type ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 text-ink-muted">
                    {row.retail_price_cents != null
                      ? formatCents(row.retail_price_cents)
                      : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-ink-muted">
                    {row.clipped_count}
                  </td>
                  <td className="px-3 py-2.5 text-ink-muted text-[0.8rem]">
                    {new Date(row.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1 flex-wrap">
                      {row.has_embedding ? (
                        <StatusPill ok>Embed</StatusPill>
                      ) : (
                        <StatusPill>No embed</StatusPill>
                      )}
                      {row.image_url ? null : <StatusPill>No img</StatusPill>}
                      {row.merged_into_id ? (
                        <StatusPill warn>
                          → {row.merged_into_name ?? 'merged'}
                        </StatusPill>
                      ) : null}
                      {row.unresolved_flag_count > 0 ? (
                        <StatusPill warn>
                          ⚑ {row.unresolved_flag_count}
                        </StatusPill>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <button
                      onClick={() => setEditing(row)}
                      className="font-sans text-[10px] uppercase tracking-[0.2em] text-ink-muted hover:text-ink mr-3"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setFlaggingFor(row)}
                      className="font-sans text-[10px] uppercase tracking-[0.2em] text-ink-muted hover:text-ink mr-3"
                      disabled={!!row.merged_into_id}
                    >
                      Flag
                    </button>
                    {row.source_url ? (
                      <a
                        href={row.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-sans text-[10px] uppercase tracking-[0.2em] text-ink-muted hover:text-ink"
                      >
                        Source ↗
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={page}
        total={data.total}
        limit={data.limit}
        onChange={setPage}
      />

      {/* ── Compare sticky bar ───────────────────────────────────── */}
      {selected.length === 2 ? (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-ink text-bg shadow-xl border border-ink px-5 py-3 flex items-center gap-4">
          <span className="font-sans text-[10px] uppercase tracking-[0.22em]">
            2 products selected
          </span>
          <button
            onClick={() =>
              setComparing([selected[0]!, selected[1]!])
            }
            className="font-sans text-[10px] uppercase tracking-[0.22em] bg-bg text-ink px-3 py-1.5"
          >
            Compare
          </button>
          <button
            onClick={clearSelection}
            className="font-sans text-[10px] uppercase tracking-[0.22em] opacity-70 hover:opacity-100"
          >
            Clear
          </button>
        </div>
      ) : null}

      <EditDrawer
        open={editing !== null}
        row={editing}
        onClose={() => setEditing(null)}
        onSaved={onSaved}
      />

      <FlagDuplicatePopover
        open={flaggingFor !== null}
        product={flaggingFor}
        onClose={() => setFlaggingFor(null)}
      />

      <CompareModal
        open={comparing !== null}
        pair={comparing}
        onClose={() => setComparing(null)}
        onResolved={() => {
          setComparing(null)
          clearSelection()
          void fetchData()
        }}
      />
    </div>
  )
}

function FilterInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="bg-transparent border border-line rounded-sm px-3 py-1.5 font-sans text-[11px] text-ink placeholder:text-ink-subtle focus:outline-none focus:border-line-strong"
    />
  )
}

function TrinaryChip({
  label,
  value,
  onChange,
}: {
  label: string
  value: 'yes' | 'no' | ''
  onChange: (v: 'yes' | 'no' | '') => void
}) {
  const next: Record<typeof value, typeof value> = {
    '': 'yes',
    yes: 'no',
    no: '',
  }
  const display =
    value === 'yes' ? `${label}: yes` : value === 'no' ? `${label}: no` : label
  return (
    <button
      onClick={() => onChange(next[value])}
      className={[
        'font-sans text-[10px] uppercase tracking-[0.2em] px-3 py-1.5 rounded-full border transition-colors',
        value === ''
          ? 'border-line text-ink-muted hover:border-line-strong'
          : 'border-ink text-ink bg-ink/[0.05]',
      ].join(' ')}
    >
      {display}
    </button>
  )
}

function StatusPill({
  children,
  ok,
  warn,
}: {
  children: React.ReactNode
  ok?: boolean
  warn?: boolean
}) {
  return (
    <Badge tone={ok ? 'sage' : warn ? 'amber' : 'neutral'}>{children}</Badge>
  )
}

function Pagination({
  page,
  total,
  limit,
  onChange,
}: {
  page: number
  total: number
  limit: number
  onChange: (p: number) => void
}) {
  const pages = Math.ceil(total / limit)
  if (pages <= 1) return null
  return (
    <div className="flex items-center justify-between mt-4 font-sans text-[10px] uppercase tracking-[0.2em] text-ink-muted">
      <div>
        Page {page} of {pages}
      </div>
      <div className="flex gap-2">
        <button
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="border border-line px-3 py-1.5 disabled:opacity-30"
        >
          Prev
        </button>
        <button
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
          className="border border-line px-3 py-1.5 disabled:opacity-30"
        >
          Next
        </button>
      </div>
    </div>
  )
}
