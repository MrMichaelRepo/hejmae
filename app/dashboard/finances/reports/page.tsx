import { redirect } from 'next/navigation'

export default function ReportsIndex() {
  redirect('/dashboard/finances/reports/profit-loss')
}
