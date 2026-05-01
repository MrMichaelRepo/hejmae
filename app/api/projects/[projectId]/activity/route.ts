import { NextResponse, type NextRequest } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { loadOwnedProject } from '@/lib/auth/ownership'
import { supabaseAdmin } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/errors'

interface Ctx {
  params: Promise<{ projectId: string }>
}

export async function GET(req: NextRequest, { params }: Ctx) {
  return withErrorHandling(async () => {
    const { projectId } = await params
    const { designerId } = await requireDesigner()
    await loadOwnedProject(designerId, projectId)

    const limit = Math.min(
      Number(req.nextUrl.searchParams.get('limit') ?? 100),
      500,
    )
    const { data, error } = await supabaseAdmin()
      .from('activity_logs')
      .select('*')
      .eq('project_id', projectId)
      .eq('designer_id', designerId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return NextResponse.json({ data })
  })
}
