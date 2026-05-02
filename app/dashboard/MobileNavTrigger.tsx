'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createPortal } from 'react-dom'
import DashboardNav from './DashboardNav'

export default function MobileNavTrigger() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Close on route change.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="md:hidden font-sans text-[14px] text-hm-text px-2"
      >
        ☰
      </button>
      {open && typeof window !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-50 md:hidden" onClick={() => setOpen(false)}>
              <div className="absolute inset-0 bg-hm-text/40" />
              <aside
                className="absolute left-0 top-0 bottom-0 w-64 bg-bg border-r border-hm-text/10 px-6 py-8 flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-12">
                  <span className="font-sans text-[13px] font-bold uppercase tracking-[0.22em] text-hm-text">
                    hejmae
                  </span>
                  <button
                    onClick={() => setOpen(false)}
                    aria-label="Close menu"
                    className="font-sans text-[14px] text-hm-nav"
                  >
                    ✕
                  </button>
                </div>
                <DashboardNav />
              </aside>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
