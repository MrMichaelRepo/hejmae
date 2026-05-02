import POsClient from './POsClient'

export default async function POsPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  return <POsClient projectId={projectId} />
}
