import FinancesNav from './FinancesNav'

export default function FinancesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="max-w-6xl">
      <FinancesNav />
      {children}
    </div>
  )
}
