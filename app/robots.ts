import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/dashboard/',
          '/api/',
          '/portal/',
          '/invite/',
          '/sign-in/',
          '/sign-up/',
          '/login/',
        ],
      },
    ],
    sitemap: 'https://www.hejmae.com/sitemap.xml',
  }
}
