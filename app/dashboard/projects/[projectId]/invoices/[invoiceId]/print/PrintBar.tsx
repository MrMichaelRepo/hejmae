'use client'

export default function PrintBar({
  invoiceId,
  projectId,
}: {
  invoiceId: string
  projectId: string
}) {
  return (
    <div className="print:hidden flex items-center justify-between px-6 py-4 border-b border-hm-text/10 bg-bg">
      <div className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-nav">
        Invoice — print preview
      </div>
      <div className="flex items-center gap-3">
        <a
          href={`/api/projects/${projectId}/invoices/${invoiceId}/pdf`}
          className="font-sans text-[11px] uppercase tracking-[0.2em] border border-hm-text/25 rounded-full px-5 py-2 text-hm-text hover:bg-hm-text hover:text-bg transition-colors"
        >
          Download PDF
        </a>
        <button
          onClick={() => window.print()}
          className="font-sans text-[11px] uppercase tracking-[0.2em] border border-hm-text/25 rounded-full px-5 py-2 text-hm-text hover:bg-hm-text hover:text-bg transition-colors"
        >
          Print / Save PDF
        </button>
      </div>
    </div>
  )
}
