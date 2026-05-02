import ProposalClient from './ProposalClient'

export default async function ProposalPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  return <ProposalClient projectId={projectId} />
}
