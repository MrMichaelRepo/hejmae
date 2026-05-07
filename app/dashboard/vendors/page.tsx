import { requireDesigner } from '@/lib/auth/designer'
import { supabaseAdmin } from '@/lib/supabase/server'
import VendorsClient from './VendorsClient'
import type { Vendor } from '@/lib/types-ui'

export default async function VendorsPage() {
  const { designerId } = await requireDesigner()
  const sb = supabaseAdmin()

  const { data } = await sb
    .from('vendors')
    .select('*')
    .eq('designer_id', designerId)
    .order('name', { ascending: true })

  return <VendorsClient initialVendors={(data ?? []) as Vendor[]} />
}
