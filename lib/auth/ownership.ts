// Ownership assertions used by API routes.
//
// Every nested resource (item, room, invoice, …) lives under a project, which
// is owned by a designer. These helpers make the ownership check explicit
// and consistent: a route loads the resource scoped to the current
// designer_id, and 404s if it does not belong to them. We deliberately
// return 404 (not 403) to avoid leaking the existence of cross-tenant rows.

import { supabaseAdmin } from '@/lib/supabase/server'
import { notFound } from '@/lib/errors'
import type { ProjectRow } from '@/lib/supabase/types'

export async function loadOwnedProject(
  designerId: string,
  projectId: string,
): Promise<ProjectRow> {
  const sb = supabaseAdmin()
  const { data, error } = await sb
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('designer_id', designerId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw notFound('Project not found')
  return data as ProjectRow
}

// Generic single-row fetch scoped to designer_id. Throws notFound on miss.
export async function loadOwned<T extends Record<string, unknown>>(
  table: string,
  designerId: string,
  id: string,
): Promise<T> {
  const sb = supabaseAdmin()
  const { data, error } = await sb
    .from(table)
    .select('*')
    .eq('id', id)
    .eq('designer_id', designerId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw notFound()
  return data as T
}
