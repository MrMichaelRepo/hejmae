import InvoicesClient from './InvoicesClient'

export default async function InvoicesPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  return <InvoicesClient projectId={projectId} />
}
