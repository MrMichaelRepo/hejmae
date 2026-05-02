import Link from 'next/link'
import ProjectTabs from './ProjectTabs'
import ProjectHeader from './ProjectHeader'

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  return (
    <div className="max-w-6xl print:max-w-none">
      <div className="print:hidden">
        <Link
          href="/dashboard/projects"
          className="inline-block font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav hover:text-hm-text mb-6"
        >
          ← All projects
        </Link>

        <ProjectHeader projectId={projectId} />

        <ProjectTabs projectId={projectId} />
      </div>

      <div>{children}</div>
    </div>
  )
}
