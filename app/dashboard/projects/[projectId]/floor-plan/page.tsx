import FloorPlanClient from './FloorPlanClient'

export default async function FloorPlanPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  return <FloorPlanClient projectId={projectId} />
}
