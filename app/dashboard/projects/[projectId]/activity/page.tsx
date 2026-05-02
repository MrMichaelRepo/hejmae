import ActivityClient from './ActivityClient'

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  return <ActivityClient projectId={projectId} />
}
