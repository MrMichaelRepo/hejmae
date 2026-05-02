// Client portal layout. No sidebar, no Clerk — magic-link only. Branding
// per-designer is fetched alongside the proposal/invoice payload.
export default function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="min-h-screen bg-bg">{children}</div>
}
