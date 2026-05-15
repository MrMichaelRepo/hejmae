// GET /api/clippings — studio-wide feed of non-deleted clippings, with
// optional filters. Trade price is intentionally excluded from the
// projection so it can never leak into the UI.

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'
import { withSignedUrlsList } from '@/lib/storage'
import { clippingListQuery } from '@/lib/validations/clipping'
import type { ClippingItemFeedRow } from '@/lib/types-ui'

// Fields we ship to the client. Note the absence of trade_price_cents,
// studio_id (internal), updated_at, deleted_at.
const SELECT_COLS = [
  'id',
  'designer_id',
  'studio_id',
  'clipper_user_id',
  'project_id',
  'catalog_product_id',
  'source_url',
  'name',
  'vendor',
  'image_url',
  'retail_price_cents',
  'description',
  'item_type',
  'scrape_status',
  'week_added',
  'created_at',
].join(',')

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    const sp = req.nextUrl.searchParams
    const query = clippingListQuery.parse({
      designer_id: sp.get('designer_id') ?? undefined,
      project_id: sp.get('project_id') ?? undefined,
      vendor: sp.get('vendor') ?? undefined,
      item_type: sp.get('item_type') ?? undefined,
      week_added: sp.get('week_added') ?? undefined,
      page: sp.get('page') ?? undefined,
      limit: sp.get('limit') ?? undefined,
    })

    const sb = supabaseAdmin()
    const from = (query.page - 1) * query.limit
    const to = from + query.limit - 1

    let q = sb
      .from('clipping_items')
      .select(SELECT_COLS, { count: 'exact' })
      .eq('designer_id', ctx.designerId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (query.designer_id) q = q.eq('clipper_user_id', query.designer_id)
    if (query.project_id) q = q.eq('project_id', query.project_id)
    if (query.vendor) q = q.ilike('vendor', query.vendor)
    if (query.item_type) q = q.ilike('item_type', query.item_type)
    if (query.week_added) q = q.eq('week_added', query.week_added)

    const { data, error, count } = await q
    if (error) throw error

    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>

    // Hydrate clipper + project in two batched fetches.
    const clipperIds = Array.from(
      new Set(rows.map((r) => r.clipper_user_id as string).filter(Boolean)),
    )
    const projectIds = Array.from(
      new Set(
        rows
          .map((r) => r.project_id as string | null)
          .filter((id): id is string => !!id),
      ),
    )

    const [clippersRes, projectsRes] = await Promise.all([
      clipperIds.length
        ? sb
            .from('users')
            .select('id, name, email, logo_url')
            .in('id', clipperIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string | null; email: string; logo_url: string | null }> }),
      projectIds.length
        ? sb.from('projects').select('id, name').in('id', projectIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    ])

    const clippers = new Map(
      (clippersRes.data ?? []).map((u) => [u.id, u]),
    )
    const projects = new Map(
      (projectsRes.data ?? []).map((p) => [p.id, p]),
    )

    // Sign logo + image URLs in two batched calls.
    const withImages = await withSignedUrlsList(rows, 'image_url')
    const clipperLogos = await withSignedUrlsList(
      Array.from(clippers.values()),
      'logo_url',
    )
    const clipperById = new Map(clipperLogos.map((u) => [u.id, u]))

    const feed: ClippingItemFeedRow[] = withImages.map((r) => {
      const clipperId = r.clipper_user_id as string
      const projectId = r.project_id as string | null
      const clipper = clipperById.get(clipperId)
      const project = projectId ? projects.get(projectId) : null
      return {
        id: r.id as string,
        designer_id: r.designer_id as string,
        studio_id: r.studio_id as string,
        clipper_user_id: clipperId,
        project_id: projectId,
        catalog_product_id: (r.catalog_product_id as string | null) ?? null,
        source_url: r.source_url as string,
        name: (r.name as string | null) ?? null,
        vendor: (r.vendor as string | null) ?? null,
        image_url: (r.image_url as string | null) ?? null,
        retail_price_cents: (r.retail_price_cents as number | null) ?? null,
        description: (r.description as string | null) ?? null,
        item_type: (r.item_type as string | null) ?? null,
        scrape_status: r.scrape_status as ClippingItemFeedRow['scrape_status'],
        week_added: r.week_added as string,
        created_at: r.created_at as string,
        clipper: clipper
          ? {
              id: clipper.id,
              name: clipper.name,
              email: clipper.email,
              logo_url: clipper.logo_url,
            }
          : {
              id: clipperId,
              name: null,
              email: '',
              logo_url: null,
            },
        project: project ? { id: project.id, name: project.name } : null,
      }
    })

    return NextResponse.json({
      data: feed,
      meta: {
        page: query.page,
        limit: query.limit,
        total: count ?? 0,
        has_more: count != null ? from + feed.length < count : false,
      },
    })
  })
}
