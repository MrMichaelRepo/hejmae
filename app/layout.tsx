import type { Metadata, Viewport } from 'next'
import { DM_Serif_Text, EB_Garamond, Inter } from 'next/font/google'
import './globals.css'
import { ToastHost } from '@/components/ui/Toast'

// Editorial display — used only at 32px+ for hero/section titles
const dmSerifText = DM_Serif_Text({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-dm-serif-text',
  display: 'swap',
})

// Long-form / proposals / marketing body — never UI chrome
const ebGaramond = EB_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-eb-garamond',
  display: 'swap',
})

// UI chrome — replaces TeX Gyre Adventor everywhere font-sans was used
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'hejmae — Interior Design Studio Software',
    template: '%s — hejmae',
  },
  description:
    'Project management, bookkeeping, and purchase tracking designed for interior design studios.',
  metadataBase: new URL('https://www.hejmae.com'),
  openGraph: {
    siteName: 'hejmae',
    type: 'website',
    locale: 'en_US',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
}

export const viewport: Viewport = {
  themeColor: '#eae8e0',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${dmSerifText.variable} ${ebGaramond.variable} ${inter.variable}`}
    >
      <body className="bg-bg text-ink font-garamond min-h-screen">
        {children}
        <ToastHost />
      </body>
    </html>
  )
}
