import type { Metadata } from 'next'
import HomePageClient from './HomePageClient'

export const metadata: Metadata = {
  title: 'Interior Design Studio Software',
  description:
    'Project management, bookkeeping, and purchase tracking designed for interior design studios. One calm workspace for your whole studio.',
  keywords: [
    'interior design software',
    'interior design project management',
    'design studio bookkeeping',
    'purchase order tracking',
    'interior designer tools',
    'studio management software',
  ],
  openGraph: {
    title: 'hejmae — Interior Design Studio Software',
    description:
      'Project management, bookkeeping, and purchase tracking for interior design studios.',
    url: 'https://www.hejmae.com',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'hejmae — Interior Design Studio Software',
    description:
      'Project management, bookkeeping, and purchase tracking for interior design studios.',
  },
  alternates: {
    canonical: 'https://www.hejmae.com',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'hejmae',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: 'https://www.hejmae.com',
  description:
    'Project management, bookkeeping, and purchase tracking for interior design studios.',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
    description: 'By invitation — founder pricing for early studios.',
  },
  provider: {
    '@type': 'Organization',
    name: 'hejmae',
    url: 'https://www.hejmae.com',
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'hello@hejmae.com',
      contactType: 'customer support',
    },
  },
}

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HomePageClient />
    </>
  )
}
