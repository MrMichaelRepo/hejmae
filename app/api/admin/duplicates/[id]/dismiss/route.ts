// POST /api/admin/duplicates/:id/dismiss
//
// Marks an unresolved CatalogDuplicateFlag as dismissed. No catalog data
// is changed — the two products keep their separate lives.

import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth/admin'
import { supabaseAdmin } from '@/lib/supabase/server'
import {
  withErrorHandling,
  badRequest,
  notFound,
  conflict,
} from '@/lib/errors'
import { dismissDuplicateInput } from '@/lib/validations/admin'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandling(async () => {
    const ctx = await requireAdmin()
    const { id } = await params
    if (!id) throw badRequest('Missing flag id')

    const raw = await safeJson(req)
    const body = dismissDuplicateInput.parse(raw)

    const sb = supabaseAdmin()
    const { data: existing, error: lookupErr } = await sb
      .from('catalog_duplicate_flags')
      .select('id, resolved')
      .eq('id', id)
      .maybeSingle()
    if (lookupErr) throw lookupErr
    if (!existing) throw notFound('Flag not found')
    if (existing.resolved) throw conflict('Flag is already resolved')

    const { data: updated, error } = await sb
      .from('catalog_duplicate_flags')
      .update({
        status: 'dismissed',
        resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: ctx.adminUserId,
        resolution_notes: body.resolution_notes ?? null,
      })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error

    return NextResponse.json({ data: updated, error: null })
  })
}

async function safeJson(req: NextRequest): Promise<unknown> {
  try {
    const text = await req.text()
    return text ? JSON.parse(text) : {}
  } catch {
    return {}
  }
}
