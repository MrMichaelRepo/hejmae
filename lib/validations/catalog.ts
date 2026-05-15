import { z } from 'zod'

// JSON body for the URL-paste flavor of /api/catalog/search/image. The
// multipart flavor parses with FormData directly in the route — Zod
// only sees the URL case.
export const imageSearchUrlInput = z.object({
  image_url: z.string().url().max(2048),
})

export type ImageSearchUrlInput = z.infer<typeof imageSearchUrlInput>
