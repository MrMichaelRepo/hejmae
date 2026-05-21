'use client'

// HelcimPay.js payment iframe mount.
//
// The portal calls /api/portal/invoices/[token]/payment-intent to get a
// checkoutToken from Helcim. We load HelcimPay's loader script and call
// `appendHelcimPayIframe(checkoutToken)` to render the modal. The customer
// completes payment inside the iframe; on success Helcim posts a window
// message we listen for, then we navigate to ?paid=1 (matching the
// Stripe-side flow). The webhook is what actually flips invoice status.
//
// NEEDS SANDBOX VERIFICATION: the loader script URL and the postMessage
// event shape below reflect Helcim's documented integration patterns but
// have not been exercised end-to-end. Validate the script URL, the
// `eventName` HelcimPay emits, and the success-payload shape.

import { useEffect, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import Alert from '@/components/ui/Alert'
import { toast } from '@/components/ui/Toast'

const HELCIM_LOADER_SRC = 'https://secure.helcim.app/helcim-pay/services/start.js'

interface Props {
  checkoutToken: string
  brandColor: string
  returnUrl: string
}

declare global {
  interface Window {
    // Injected by the HelcimPay loader script.
    appendHelcimPayIframe?: (token: string, withModalAlert?: boolean) => void
    removeHelcimPayIframe?: () => void
  }
}

export default function HelcimPaymentForm({
  checkoutToken,
  brandColor,
  returnUrl,
}: Props) {
  const [loadingScript, setLoadingScript] = useState(true)
  const [scriptError, setScriptError] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const handlerRef = useRef<((ev: MessageEvent) => void) | null>(null)

  // Lazy-load the HelcimPay loader exactly once per page.
  useEffect(() => {
    let cancelled = false
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${HELCIM_LOADER_SRC}"]`,
    )
    if (existing && typeof window.appendHelcimPayIframe === 'function') {
      setLoadingScript(false)
      return
    }
    const s = existing ?? document.createElement('script')
    s.src = HELCIM_LOADER_SRC
    s.async = true
    const onLoad = () => {
      if (!cancelled) setLoadingScript(false)
    }
    const onErr = () => {
      if (!cancelled) {
        setScriptError(true)
        setLoadingScript(false)
      }
    }
    s.addEventListener('load', onLoad)
    s.addEventListener('error', onErr)
    if (!existing) document.head.appendChild(s)
    return () => {
      cancelled = true
      s.removeEventListener('load', onLoad)
      s.removeEventListener('error', onErr)
    }
  }, [])

  // Listen for HelcimPay's success postMessage.
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      // Helcim posts events using a per-checkout event name. The payload
      // shape on success generally includes a transactionId and status.
      // We treat any message whose payload looks like a successful
      // transaction completion as "done" and navigate to ?paid=1.
      const data = ev.data as unknown
      if (!data || typeof data !== 'object') return
      const eventName =
        (data as { eventName?: string }).eventName ??
        (data as { type?: string }).type
      if (!eventName || typeof eventName !== 'string') return
      // Match either Helcim's `helcim-pay-${token}` event channel or any
      // SUCCESS-shaped status; defensive against minor SDK shifts.
      const looksLikeHelcim =
        eventName.startsWith('helcim-pay-') || eventName === 'helcimPay'
      if (!looksLikeHelcim) return
      const eventStatus =
        (data as { eventStatus?: string }).eventStatus ??
        (data as { status?: string }).status
      if (eventStatus === 'SUCCESS' || eventStatus === 'APPROVED') {
        setSubmitting(true)
        // The webhook does the authoritative status flip; the redirect lets
        // PortalInvoice poll for the update (same UX as the Stripe path).
        window.location.href = returnUrl
      } else if (eventStatus === 'ABORTED' || eventStatus === 'HIDE') {
        setMounted(false)
      } else if (eventStatus === 'ERROR' || eventStatus === 'FAILURE') {
        const msg =
          (data as { errorMessage?: string }).errorMessage ??
          'Payment was declined or failed'
        toast.error(msg)
        setMounted(false)
      }
    }
    handlerRef.current = handler
    window.addEventListener('message', handler)
    return () => {
      window.removeEventListener('message', handler)
    }
  }, [returnUrl])

  const openPay = () => {
    if (typeof window.appendHelcimPayIframe !== 'function') {
      toast.error('Helcim payment is not ready yet — please try again in a moment')
      return
    }
    setMounted(true)
    window.appendHelcimPayIframe(checkoutToken, true)
  }

  return (
    <div className="space-y-3">
      {scriptError ? (
        <Alert tone="danger" title="Couldn’t load the payment form">
          The Helcim checkout script failed to load. Refresh the page or try
          again from a different network.
        </Alert>
      ) : null}

      {!mounted ? (
        <Button
          variant="primary"
          size="lg"
          onClick={openPay}
          loading={loadingScript || submitting}
          disabled={loadingScript || submitting || scriptError}
          style={{ background: brandColor, borderColor: brandColor }}
        >
          {submitting ? 'Confirming payment…' : 'Pay invoice'}
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="font-garamond text-[0.95rem] text-ink-muted">
            Complete payment in the Helcim window. This page will refresh
            automatically when payment is confirmed.
          </div>
          <button
            type="button"
            onClick={() => {
              try {
                window.removeHelcimPayIframe?.()
              } catch {}
              setMounted(false)
            }}
            className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted hover:text-ink transition-colors"
          >
            Cancel and start over
          </button>
        </div>
      )}
    </div>
  )
}
