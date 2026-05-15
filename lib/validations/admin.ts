// Zod schemas for /api/admin/* request payloads. Lives in /lib/validations
// alongside catalog.ts and clipping.ts.

import { z } from 'zod'

export const mergeDuplicateInput = z.object({
  keep_product_id: z.string().uuid(),
  remove_product_id: z.string().uuid(),
  resolution_notes: z.string().trim().max(1000).optional(),
})

export type MergeDuplicateInput = z.infer<typeof mergeDuplicateInput>

export const dismissDuplicateInput = z.object({
  resolution_notes: z.string().trim().max(1000).optional(),
})

export type DismissDuplicateInput = z.infer<typeof dismissDuplicateInput>

export const flagDuplicateInput = z
  .object({
    product_a_id: z.string().uuid(),
    product_b_id: z.string().uuid(),
  })
  .refine((v) => v.product_a_id !== v.product_b_id, {
    message: 'product_a_id and product_b_id must differ',
    path: ['product_b_id'],
  })

export type FlagDuplicateInput = z.infer<typeof flagDuplicateInput>

export const updateCatalogProductInput = z
  .object({
    name: z.string().trim().min(1).max(500).optional(),
    vendor: z.string().trim().max(200).nullable().optional(),
    category: z.string().trim().max(200).nullable().optional(),
    item_type: z.string().trim().max(200).nullable().optional(),
    retail_price_cents: z.number().int().min(0).nullable().optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    image_url: z.string().trim().max(2000).nullable().optional(),
    source_url: z.string().trim().max(2000).nullable().optional(),
    style_tags: z.array(z.string().trim().min(1).max(60)).max(40).optional(),
  })
  .strict()

export type UpdateCatalogProductInput = z.infer<typeof updateCatalogProductInput>
