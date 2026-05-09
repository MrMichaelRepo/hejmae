import ReportsNav from './ReportsNav'

export default function ReportsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div>
      <ReportsNav />
      {children}
    </div>
  )
}
