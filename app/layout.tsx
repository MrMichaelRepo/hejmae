import type { Metadata } from 'next'
import { DM_Serif_Text } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
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
    default: 'hejmae',
    template: '%s — hejmae',
  },
  description:
    'Interior design project management, bookkeeping, and purchase tracking.',
  metadataBase: new URL('https://www.hejmae.com'),
  openGraph: {
    siteName: 'hejmae',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ClerkProvider
      afterSignOutUrl="/"
      appearance={{
        variables: {
          colorPrimary: '#1e2128',
          colorText: '#1e2128',
          colorTextSecondary: '#4a5068',
          borderRadius: '0.375rem',
        },
      }}
    >
      <html lang="en" className={dmSerifText.variable}>
        <body className="bg-bg text-hm-text font-garamond min-h-screen">
          {children}
          <ToastHost />
        </body>
      </html>
    </ClerkProvider>
  )
}
