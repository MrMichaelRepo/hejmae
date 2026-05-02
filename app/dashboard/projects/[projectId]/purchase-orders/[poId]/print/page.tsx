import POPrint from './POPrint'

export default async function POPrintPage({
  params,
}: {
  params: Promise<{ projectId: string; poId: string }>
}) {
  const { projectId, poId } = await params
  return <POPrint projectId={projectId} poId={poId} />
}
