// GET  → dry-run preview of QBO chart-of-accounts import.
// POST → apply: create/merge accounts and link refs.

import { NextResponse } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requireRole } from '@/lib/auth/permissions'
import { withErrorHandling } from '@/lib/errors'
import {
  applyAccountImport,
  previewAccountImport,
} from '@/lib/qbo/import'

export async function GET() {
  return withErrorHandling(async () => {
    const { designerId } = await requireDesigner()
    const data = await previewAccountImport(designerId)
    return NextResponse.json({ data })
  })
}

export async function POST() {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requireRole(ctx, 'owner')
    const result = await applyAccountImport(ctx.designerId)
    return NextResponse.json({ data: result })
  })
}
