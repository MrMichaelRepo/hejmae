'use client'

// QuickBooks Online connection card on the Settings page.
//
// States:
//   * not configured  — env vars missing on this deployment.
//   * not connected   — Connect button starts the OAuth flow.
//   * connected       — shows realm id, environment, company name,
//                       refresh-token expiry, and a Disconnect button.
// After the OAuth callback the user lands back on /dashboard/settings
// with ?qbo=connected or ?qbo=error&qbo_detail=… — we surface those.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import Button from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import type {
  QboConnectionRow,
  QboEnvironment,
} from '@/lib/supabase/types'

interface QboCompany {
  companyName: string
  legalName: string | null
  country: string | null
  fiscalYearStartMonth: string | null
}

interface QboState {
  configured: boolean
  connection: QboConnectionRow | null
  company?: QboCompany | null
}

export default function QuickBooksSection({ canEdit }: { canEdit: boolean }) {
  const [state, setState] = useState<QboState | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  const refresh = async () => {
    try {
      const res = await api.get<QboState>('/api/integrations/qbo')
      setState((res as { data?: QboState }).data ?? (res as unknown as QboState))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  useEffect(() => {
    void refresh()
    // Surface the OAuth callback outcome.
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search)
      const qbo = sp.get('qbo')
      const detail = sp.get('qbo_detail')
      if (qbo === 'connected') {
        toast.success('QuickBooks connected')
      } else if (qbo === 'error') {
        toast.error(`QuickBooks connection failed${detail ? `: ${detail}` : ''}`)
      }
      if (qbo) {
        // Strip the params so a refresh doesn't re-toast.
        sp.delete('qbo')
        sp.delete('qbo_detail')
        const next = sp.toString()
        window.history.replaceState(
          null,
          '',
          window.location.pathname + (next ? `?${next}` : ''),
        )
      }
    }
  }, [])

  const connect = async () => {
    setConnecting(true)
    try {
      const res = await api.post<{ authorize_url: string }>(
        '/api/integrations/qbo/connect',
      )
      const url = (res as { authorize_url?: string }).authorize_url
      if (url) window.location.href = url
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setConnecting(false)
    }
  }

  const disconnect = async () => {
    if (!confirm('Disconnect QuickBooks? Sync will stop until you reconnect.')) return
    setDisconnecting(true)
    try {
      await api.del('/api/integrations/qbo')
      toast.success('QuickBooks disconnected')
      await refresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setDisconnecting(false)
    }
  }

  if (!state) {
    return (
      <div className="font-garamond text-[0.95rem] text-hm-nav">Loading…</div>
    )
  }

  if (!state.configured) {
    return (
      <div className="font-garamond text-[0.95rem] text-hm-nav leading-[1.6]">
        QuickBooks integration is not configured on this deployment. An admin
        needs to set <code className="font-mono text-[0.85rem]">QBO_CLIENT_ID</code> and{' '}
        <code className="font-mono text-[0.85rem]">QBO_CLIENT_SECRET</code> in the environment.
      </div>
    )
  }

  const conn = state.connection
  const isActive = conn?.status === 'active'

  return (
    <div>
      <p className="font-garamond text-[0.95rem] text-hm-nav mb-5 leading-[1.6]">
        Sync customers, invoices, payments, expenses, and journal entries to
        QuickBooks Online — or import your existing books to migrate over.
        You can also keep both running in parallel during a trial.
      </p>

      <div
        className={`border p-5 ${isActive ? 'border-hm-text bg-hm-text/[0.04]' : 'border-hm-text/15'}`}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="font-serif text-[1.2rem]">QuickBooks Online</div>
          {isActive ? (
            <span className="font-sans text-[10px] uppercase tracking-[0.22em] text-hm-text border border-hm-text px-2 py-0.5">
              Connected
            </span>
          ) : conn?.status === 'expired' ? (
            <span className="font-sans text-[10px] uppercase tracking-[0.22em] text-amber-700 border border-amber-700/40 px-2 py-0.5">
              Reconnect needed
            </span>
          ) : null}
        </div>

        {isActive && conn ? (
          <div className="font-garamond text-[0.9rem] text-hm-nav space-y-1 mb-4">
            <div>
              Company:{' '}
              <span className="text-hm-text">
                {state.company?.companyName ?? '—'}
              </span>
            </div>
            <div>
              Realm: <span className="font-mono text-[0.85rem]">{conn.realm_id}</span>
              <span className="ml-2 text-hm-nav">
                ({envLabel(conn.environment)})
              </span>
            </div>
            {conn.refresh_token_expires_at ? (
              <div>
                Refresh token expires{' '}
                <span className="text-hm-text">
                  {new Date(conn.refresh_token_expires_at).toLocaleDateString()}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 mt-4">
          {!conn || conn.status !== 'active' ? (
            <Button
              variant="primary"
              onClick={connect}
              loading={connecting}
              disabled={!canEdit}
            >
              {conn?.status === 'expired' ? 'Reconnect QuickBooks' : 'Connect QuickBooks'}
            </Button>
          ) : null}
          {isActive ? (
            <Link
              href="/dashboard/settings/qbo"
              className="inline-flex items-center gap-2 font-sans text-[10px] uppercase tracking-[0.2em] text-hm-text border border-hm-text/25 hover:bg-hm-text hover:text-bg rounded-full px-6 py-2.5 transition-colors"
            >
              Manage mapping & sync →
            </Link>
          ) : null}
          {conn ? (
            <Button
              variant="ghost"
              onClick={disconnect}
              loading={disconnecting}
              disabled={!canEdit}
            >
              Disconnect
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function envLabel(env: QboEnvironment): string {
  return env === 'production' ? 'Production' : 'Sandbox'
}
