import type { Metadata, Viewport } from 'next'
import { DM_Serif_Text } from 'next/font/google'
import './globals.css'
import { ToastHost } from '@/components/ui/Toast'

const dmSerifText = DM_Serif_Text({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-dm-serif-text',
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
    <html lang="en" className={dmSerifText.variable}>
      <body className="bg-bg text-hm-text font-garamond min-h-screen">
        {children}
        <ToastHost />
      </body>
    </html>
  )
}
