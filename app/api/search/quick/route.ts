// Fuzzy multi-table search for the ⌘K palette. Caps each entity at 5 rows
// so the palette stays scannable; the user can refine by typing more of the
// name. Designer-scoped — never returns rows from other studios.

import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'

const PER_GROUP = 5

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const { designerId } = await requireDesigner()
    const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
    if (q.length < 2) {
      return NextResponse.json({
        data: { projects: [], clients: [], vendors: [], catalog_products: [] },
      })
    }
    const sb = supabaseAdmin()
    const like = `%${q}%`

    const [projects, clients, vendors, catalog] = await Promise.all([
      sb
        .from('projects')
        .select('id, name, location, status')
        .eq('designer_id', designerId)
        .ilike('name', like)
        .order('updated_at', { ascending: false })
        .limit(PER_GROUP),
      sb
        .from('clients')
        .select('id, name, email')
        .eq('designer_id', designerId)
        .ilike('name', like)
        .order('name', { ascending: true })
        .limit(PER_GROUP),
      sb
        .from('vendors')
        .select('id, name')
        .eq('designer_id', designerId)
        .ilike('name', like)
        .order('name', { ascending: true })
        .limit(PER_GROUP),
      // Catalog products are shared across studios; no designer_id filter.
      sb
        .from('catalog_products')
        .select('id, name, brand')
        .ilike('name', like)
        .order('clipped_count', { ascending: false })
        .limit(PER_GROUP),
    ])

    return NextResponse.json({
      data: {
        projects: projects.data ?? [],
        clients: clients.data ?? [],
        vendors: vendors.data ?? [],
        catalog_products: catalog.data ?? [],
      },
    })
  })
}
