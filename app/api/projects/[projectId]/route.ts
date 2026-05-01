// /api/projects/[projectId] — read / update / archive
import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { loadOwnedProject } from '@/lib/auth/ownership'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'
import { updateProject } from '@/lib/validations/project'

interface Ctx {
  params: Promise<{ projectId: string }>
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId } = await params
    const { designerId } = await requireDesigner()
    const project = await loadOwnedProject(designerId, projectId)
    return NextResponse.json({ data: project })
  })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId } = await params
    const { designerId } = await requireDesigner()
    await loadOwnedProject(designerId, projectId)
    const body = updateProject.parse(await req.json())

    const { data, error } = await supabaseAdmin()
      .from('projects')
      .update(body)
      .eq('id', projectId)
      .eq('designer_id', designerId)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ data })
  })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId } = await params
    const { designerId } = await requireDesigner()
    await loadOwnedProject(designerId, projectId)
    // Soft-archive instead of hard delete — preserves financial history.
    const { error } = await supabaseAdmin()
      .from('projects')
      .update({ status: 'archived' })
      .eq('id', projectId)
      .eq('designer_id', designerId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  })
}
