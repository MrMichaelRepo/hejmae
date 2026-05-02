import OverviewClient from './OverviewClient'

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  return <OverviewClient projectId={projectId} />
}
