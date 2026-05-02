import PortalProposal from './PortalProposal'

export default async function PortalProposalPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <PortalProposal token={token} />
}
