'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/**
 * Opens a modal/drawer when a given query param is present, then strips the
 * param from the URL so a refresh doesn't reopen it.
 *
 * Used to support cmd-K palette actions like "New project" that link to
 * /dashboard/projects?new=1 and rely on the destination page to actually
 * open the create flow.
 *
 * Example:
 *   const [open, setOpen] = useState(false)
 *   useOpenOnQuery('new', () => setOpen(true))
 */
export function useOpenOnQuery(param: string, onOpen: () => void) {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current) return
    if (!params) return
    if (!params.has(param)) return
    fired.current = true
    onOpen()
    const next = new URLSearchParams(params.toString())
    next.delete(param)
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [params, param, onOpen, router, pathname])
}
