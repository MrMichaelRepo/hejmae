import { NextResponse } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requireRole } from '@/lib/auth/permissions'
import { withErrorHandling } from '@/lib/errors'
import {
  applyVendorImport,
  previewVendorImport,
} from '@/lib/qbo/import'

export async function GET() {
  return withErrorHandling(async () => {
    const { designerId } = await requireDesigner()
    const data = await previewVendorImport(designerId)
    return NextResponse.json({ data })
  })
}

export async function POST() {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requireRole(ctx, 'owner')
    const result = await applyVendorImport(ctx.designerId)
    return NextResponse.json({ data: result })
  })
}
