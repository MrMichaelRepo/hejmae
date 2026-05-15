'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { api, ApiError } from '@/lib/api'
import { formatCents } from '@/lib/format'
import EmptyState from '@/components/ui/EmptyState'
import { PageSpinner } from '@/components/ui/Spinner'
import { toast } from '@/components/ui/Toast'
import MergeModal from './MergeModal'
import type {
  DuplicateFlagWithProducts,
  ListDuplicatesResult,
} from '@/lib/admin/duplicates'

type PrimaryTab = 'unresolved' | 'resolved'
type UnresolvedSub = 'all' | 'new' | 'carried'
type ResolvedSub = 'all' | 'merged' | 'dismissed'

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000
const TWO_WEEKS_MS = 2 * ONE_WEEK_MS

export default function DuplicatesClient({
  initial,
  stats,
}: {
  initial: ListDuplicatesResult
  stats: { unresolved: number; resolved30: number; newThisWeek: number }
}) {
  const [tab, setTab] = useState<PrimaryTab>('unresolved')
  const [unresolvedSub, setUnresolvedSub] = useState<UnresolvedSub>('all')
  const [resolvedSub, setResolvedSub] = useState<ResolvedSub>('all')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ListDuplicatesResult | null>(initial)
  const [loading, setLoading] = useState(false)
  const [merging, setMerging] = useState<DuplicateFlagWithProducts | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('resolved', tab === 'resolved' ? 'true' : 'false')
      if (tab === 'resolved' && resolvedSub !== 'all') {
        params.set(
          'status',
          resolvedSub === 'merged' ? 'confirmed_duplicate' : 'dismissed',
        )
      }
      params.set('page', String(page))
      params.set('limit', '20')
      const res = await api.get<ListDuplicatesResult>(
        `/api/admin/duplicates?${params.toString()}`,
      )
      setData(res.data ?? null)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [tab, resolvedSub, page])

  // Skip the first reload — we already have initial server data for
  // (unresolved, all, page=1).
  const initialLoadRef = useRef(true)
  useEffect(() => {
    if (initialLoadRef.current) {
      initialLoadRef.current = false
      return
    }
    void reload()
  }, [reload])

  // Filter unresolvedSub client-side from the loaded page — we already
  // have flagged_at, so the chips can split "this week" from "carried"
  // without a server roundtrip.
  const filteredItems = useMemo(() => {
    if (!data) return []
    if (tab !== 'unresolved' || unresolvedSub === 'all') return data.items
    const cutoff = Date.now() - ONE_WEEK_MS
    return data.items.filter((row) => {
      const ts = new Date(row.flag.flagged_at).getTime()
      return unresolvedSub === 'new' ? ts >= cutoff : ts < cutoff
    })
  }, [data, tab, unresolvedSub])

  const onDismiss = async (row: DuplicateFlagWithProducts) => {
    // Optimistic remove.
    setData((prev) =>
      prev
        ? { ...prev, items: prev.items.filter((r) => r.flag.id !== row.flag.id) }
        : prev,
    )
    try {
      await api.post(`/api/admin/duplicates/${row.flag.id}/dismiss`, {})
      toast.success('Dismissed')
    } catch (err) {
      // Restore on failure.
      setData((prev) => (prev ? { ...prev, items: [row, ...prev.items] } : prev))
      toast.error(err instanceof ApiError ? err.message : 'Dismiss failed')
    }
    if (undoTimer.current) clearTimeout(undoTimer.current)
  }

  const onMergeSuccess = (flagId: string) => {
    setData((prev) =>
      prev
        ? { ...prev, items: prev.items.filter((r) => r.flag.id !== flagId) }
        : prev,
    )
    setMerging(null)
    toast.success('Merged')
  }

  // Keyboard shortcuts when the merge modal isn't open: D = dismiss the
  // first unresolved card, M = open merge for the first card.
  useEffect(() => {
    if (tab !== 'unresolved') return
    const onKey = (e: KeyboardEvent) => {
      if (merging) return
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return
      if ((e.target as HTMLElement | null)?.tagName === 'TEXTAREA') return
      const first = filteredItems[0]
      if (!first) return
      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault()
        void onDismiss(first)
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault()
        setMerging(first)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredItems, tab, merging])

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-8 max-w-2xl">
        <StatCard label="Unresolved" value={stats.unresolved} />
        <StatCard label="Resolved · last 30 days" value={stats.resolved30} />
        <StatCard label="New this week" value={stats.newThisWeek} />
      </div>

      <div className="mb-6 font-garamond text-[0.9rem] text-hm-nav">
        Last scan: Mondays at 06:00 UTC. Resolved pairs persist forever; the
        scanner refreshes existing unresolved flags rather than re-creating
        them.
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
        <div className="flex gap-px bg-hm-text/10 rounded-sm overflow-hidden w-fit">
          {(
            [
              ['unresolved', 'Unresolved'],
              ['resolved', 'Resolved'],
            ] as Array<[PrimaryTab, string]>
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => {
                setTab(k)
                setPage(1)
              }}
              className={[
                'font-sans text-[10px] uppercase tracking-[0.22em] px-5 py-2.5 transition-colors',
                tab === k
                  ? 'bg-hm-text text-bg'
                  : 'bg-bg text-hm-nav hover:text-hm-text',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'unresolved' ? (
          <SubChips
            options={[
              ['all', 'All'],
              ['new', 'New this week'],
              ['carried', 'Carried over'],
            ]}
            value={unresolvedSub}
            onChange={(v) => setUnresolvedSub(v as UnresolvedSub)}
          />
        ) : (
          <SubChips
            options={[
              ['all', 'All'],
              ['merged', 'Merged'],
              ['dismissed', 'Dismissed'],
            ]}
            value={resolvedSub}
            onChange={(v) => {
              setResolvedSub(v as ResolvedSub)
              setPage(1)
            }}
          />
        )}
      </div>

      {tab === 'unresolved' ? (
        <div className="mb-4 font-sans text-[10px] uppercase tracking-[0.2em] text-hm-nav/70">
          Shortcuts: <Kbd>D</Kbd> dismiss · <Kbd>M</Kbd> merge (acts on the
          first card)
        </div>
      ) : null}

      {loading || !data ? (
        <PageSpinner />
      ) : filteredItems.length === 0 ? (
        <EmptyState
          title={
            tab === 'unresolved' ? 'No duplicates to review' : 'No history yet'
          }
          body={
            tab === 'unresolved'
              ? 'The scanner runs Mondays at 06:00 UTC. New flags show up here automatically.'
              : 'Resolved pairs appear here once you merge or dismiss them.'
          }
          small
        />
      ) : (
        <div className="flex flex-col gap-4">
          {filteredItems.map((row) => (
            <FlagCard
              key={row.flag.id}
              row={row}
              kind={tab}
              onDismiss={() => onDismiss(row)}
              onMerge={() => setMerging(row)}
            />
          ))}
        </div>
      )}

      {data && data.total > data.limit ? (
        <Pagination
          page={page}
          total={data.total}
          limit={data.limit}
          onChange={setPage}
        />
      ) : null}

      <MergeModal
        open={merging !== null}
        row={merging}
        onClose={() => setMerging(null)}
        onMerged={onMergeSuccess}
      />
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-hm-text/10 px-4 py-3">
      <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-1">
        {label}
      </div>
      <div className="font-serif text-[1.6rem] leading-none">{value}</div>
    </div>
  )
}

function SubChips({
  options,
  value,
  onChange,
}: {
  options: Array<[string, string]>
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map(([k, label]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={[
            'font-sans text-[10px] uppercase tracking-[0.2em] px-3 py-1.5 rounded-full border transition-colors',
            value === k
              ? 'border-hm-text text-hm-text bg-hm-text/[0.05]'
              : 'border-hm-text/15 text-hm-nav hover:border-hm-text/40 hover:text-hm-text',
          ].join(' ')}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block px-1.5 py-px border border-hm-text/20 rounded-sm text-[10px] text-hm-text font-mono mx-0.5">
      {children}
    </span>
  )
}

function FlagCard({
  row,
  kind,
  onDismiss,
  onMerge,
}: {
  row: DuplicateFlagWithProducts
  kind: PrimaryTab
  onDismiss: () => void
  onMerge: () => void
}) {
  const { flag, product_a, product_b } = row
  const flaggedAt = new Date(flag.flagged_at)
  const lastSeenAt = new Date(flag.last_seen_at)
  const stale = Date.now() - lastSeenAt.getTime() > TWO_WEEKS_MS
  const similarityPct =
    flag.similarity_score != null
      ? `${Math.round(flag.similarity_score * 100)}% similar`
      : 'Manual flag'

  return (
    <div className="border border-hm-text/10 p-5">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-text">
          {similarityPct}
        </span>
        {flag.match_reasons.map((reason) => (
          <ReasonBadge key={reason} reason={reason} />
        ))}
        {stale && kind === 'unresolved' ? (
          <span className="font-sans text-[10px] uppercase tracking-[0.2em] text-hm-nav/70 border border-hm-text/10 rounded-full px-2.5 py-0.5">
            Not seen in recent scan
          </span>
        ) : null}
        <div className="ml-auto font-sans text-[10px] uppercase tracking-[0.2em] text-hm-nav">
          First flagged {flaggedAt.toLocaleDateString()} · Last seen{' '}
          {lastSeenAt.toLocaleDateString()}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <ProductPanel side="A" product={product_a} />
        <ProductPanel side="B" product={product_b} />
      </div>

      {kind === 'unresolved' ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={onDismiss}
            className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav hover:text-hm-text border border-hm-text/15 hover:border-hm-text/40 px-4 py-2"
          >
            Dismiss — not a duplicate
          </button>
          <button
            onClick={onMerge}
            className="font-sans text-[10px] uppercase tracking-[0.22em] bg-hm-text text-bg hover:bg-hm-text/90 px-4 py-2"
          >
            Merge
          </button>
        </div>
      ) : (
        <div className="font-garamond text-[0.95rem] text-hm-nav">
          {flag.status === 'confirmed_duplicate'
            ? `Merged ${flag.resolved_at ? new Date(flag.resolved_at).toLocaleDateString() : ''}${row.resolved_by_name ? ` by ${row.resolved_by_name}` : ''}`
            : `Dismissed ${flag.resolved_at ? new Date(flag.resolved_at).toLocaleDateString() : ''}${row.resolved_by_name ? ` by ${row.resolved_by_name}` : ''}`}
          {flag.resolution_notes ? (
            <div className="mt-1 text-hm-text">
              <span className="text-hm-nav/70">Notes:</span>{' '}
              {flag.resolution_notes}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

function ProductPanel({
  side,
  product,
}: {
  side: 'A' | 'B'
  product: DuplicateFlagWithProducts['product_a']
}) {
  if (!product) {
    return (
      <div className="border border-hm-text/10 p-4 text-hm-nav">
        <div className="font-sans text-[10px] uppercase tracking-[0.22em] mb-2">
          Product {side}
        </div>
        <div className="font-garamond text-[0.95rem]">Product no longer exists.</div>
      </div>
    )
  }
  return (
    <div className="border border-hm-text/10 p-4">
      <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav mb-2">
        Product {side}
      </div>
      <div className="flex gap-3">
        <div className="w-20 h-20 bg-hm-text/[0.05] relative shrink-0 overflow-hidden">
          {product.image_url ? (
            <Image
              src={product.image_url}
              alt=""
              fill
              sizes="80px"
              className="object-cover"
              unoptimized
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-garamond text-[1rem] leading-tight line-clamp-2 mb-1">
            {product.name}
          </div>
          <div className="font-sans text-[10px] uppercase tracking-[0.18em] text-hm-nav mb-1">
            {product.vendor ?? '—'}
          </div>
          <div className="font-garamond text-[0.9rem] text-hm-nav">
            {product.retail_price_cents != null
              ? formatCents(product.retail_price_cents)
              : 'No price'}
            {' · '}
            {product.clipped_count} clip{product.clipped_count === 1 ? '' : 's'}
          </div>
          {product.source_url ? (
            <a
              href={product.source_url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block font-sans text-[10px] uppercase tracking-[0.2em] text-hm-nav hover:text-hm-text underline-offset-2 hover:underline truncate max-w-full"
            >
              {safeDomain(product.source_url)}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function ReasonBadge({ reason }: { reason: string }) {
  const LABEL: Record<string, string> = {
    high_vector_similarity: 'High similarity',
    same_vendor: 'Same vendor',
    similar_price: 'Similar price',
    same_source_domain: 'Same domain',
    manual_flag: 'Manual flag',
  }
  return (
    <span className="font-sans text-[10px] uppercase tracking-[0.2em] text-hm-text border border-hm-text/20 rounded-full px-2.5 py-0.5">
      {LABEL[reason] ?? reason}
    </span>
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
    <div className="flex items-center justify-between mt-6 font-sans text-[10px] uppercase tracking-[0.2em] text-hm-nav">
      <div>
        Page {page} of {pages}
      </div>
      <div className="flex gap-2">
        <button
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="border border-hm-text/15 px-3 py-1.5 disabled:opacity-30"
        >
          Prev
        </button>
        <button
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
          className="border border-hm-text/15 px-3 py-1.5 disabled:opacity-30"
        >
          Next
        </button>
      </div>
    </div>
  )
}

function safeDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
