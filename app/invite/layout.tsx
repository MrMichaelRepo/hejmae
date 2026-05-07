import { ClerkProvider } from '@clerk/nextjs'

export default function InviteLayout({
  children,
}: {
  children: React.ReactNode
}) {
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
      {children}
    </ClerkProvider>
  )
}
