import ItemsClient from './ItemsClient'

export default async function ItemsPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  return <ItemsClient projectId={projectId} />
}
