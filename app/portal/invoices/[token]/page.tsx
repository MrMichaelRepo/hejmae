import PortalInvoice from './PortalInvoice'

export default async function PortalInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <PortalInvoice token={token} />
}
