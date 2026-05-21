import { ClerkProvider } from '@clerk/nextjs'
import { clerkAppearance } from '@/lib/clerkAppearance'

export default function SignUpLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider afterSignOutUrl="/" appearance={clerkAppearance}>
      {children}
    </ClerkProvider>
  )
}
