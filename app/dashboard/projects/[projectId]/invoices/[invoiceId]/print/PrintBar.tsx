'use client'

export default function PrintBar({
  invoiceId,
  projectId,
}: {
  invoiceId: string
  projectId: string
}) {
  return (
    <div className="print:hidden flex items-center justify-between px-6 py-4 border-b border-line bg-bg">
      <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted">
        Invoice — print preview
      </div>
      <div className="flex items-center gap-3">
        <a
          href={`/api/projects/${projectId}/invoices/${invoiceId}/pdf`}
          className="font-sans text-[11px] uppercase tracking-[0.2em] border border-line-strong rounded-full px-5 py-2 text-ink hover:bg-ink hover:text-bg transition-colors"
        >
          Download PDF
        </a>
        <button
          onClick={() => window.print()}
          className="font-sans text-[11px] uppercase tracking-[0.2em] border border-line-strong rounded-full px-5 py-2 text-ink hover:bg-ink hover:text-bg transition-colors"
        >
          Print / Save PDF
        </button>
      </div>
    </div>
  )
}
