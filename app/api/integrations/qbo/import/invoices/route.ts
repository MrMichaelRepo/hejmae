// GET  → preview open A/R invoices in QBO.
// POST → import each into a per-studio "QuickBooks import" project.

import { NextResponse } from 'next/server'
import { requireDesigner } from '@/lib/auth/designer'
import { requireRole } from '@/lib/auth/permissions'
import { withErrorHandling } from '@/lib/errors'
import {
  applyInvoiceImport,
  previewInvoiceImport,
} from '@/lib/qbo/import-invoices'

export async function GET() {
  return withErrorHandling(async () => {
    const { designerId } = await requireDesigner()
    const data = await previewInvoiceImport(designerId)
    return NextResponse.json({ data })
  })
}

export async function POST() {
  return withErrorHandling(async () => {
    const ctx = await requireDesigner()
    requireRole(ctx, 'owner')
    const result = await applyInvoiceImport(ctx.designerId)
    return NextResponse.json({ data: result })
  })
}
