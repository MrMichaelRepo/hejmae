'use client'

// Two-card payment-processor UI for the Settings page.
//
// Both Stripe and Helcim can be onboarded simultaneously; the studio picks
// which one new invoices route to via the "Use this for payments" button.
// Helcim's pay flow is not yet implemented — the card collects credentials
// and lets the studio toggle Helcim active, but the actual checkout path
// throws HelcimNotImplementedError until the integration ships.

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Button from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import SelectableCard from '@/components/ui/SelectableCard'
import Alert from '@/components/ui/Alert'
import { Field, Input } from '@/components/ui/Input'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { toast } from '@/components/ui/Toast'
import type { PaymentProcessorName } from '@/lib/supabase/types'

interface AccountSummary {
  processor: PaymentProcessorName
  status: 'pending' | 'active' | 'disabled'
  external_account_id: string
  config_keys: string[]
}

interface State {
  active_processor: PaymentProcessorName | null
  accounts: AccountSummary[]
}

export default function PaymentProcessorsSection({ canEdit }: { canEdit: boolean }) {
  const confirm = useConfirm()
  const [state, setState] = useState<State | null>(null)
  const [loading, setLoading] = useState(false)
  const [helcimToken, setHelcimToken] = useState('')
  const [helcimAccount, setHelcimAccount] = useState('')
  const [helcimWebhookVerifier, setHelcimWebhookVerifier] = useState('')
  const [savingHelcim, setSavingHelcim] = useState(false)

  const refresh = async () => {
    try {
      const res = await api.get<State>('/api/settings/payment-processors')
      setState((res as { data?: State }).data ?? (res as unknown as State))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const stripe = state?.accounts.find((a) => a.processor === 'stripe')
  const helcim = state?.accounts.find((a) => a.processor === 'helcim')
  const active = state?.active_processor ?? null

  const connectStripe = async () => {
    setLoading(true)
    try {
      const res = await api.post<{ onboarding_url: string }>(
        '/api/settings/stripe-connect',
      )
      const url = (res as { onboarding_url?: string }).onboarding_url
      if (url) window.location.href = url
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const saveHelcim = async () => {
    if (!helcimToken || !helcimAccount) {
      toast.error('Both API token and account id are required')
      return
    }
    setSavingHelcim(true)
    try {
      await api.post('/api/settings/payment-processors/helcim', {
        api_token: helcimToken,
        account_id: helcimAccount,
        webhook_verifier: helcimWebhookVerifier || null,
      })
      toast.success('Helcim credentials saved')
      setHelcimToken('')
      setHelcimWebhookVerifier('')
      await refresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSavingHelcim(false)
    }
  }

  const disconnectHelcim = async () => {
    const ok = await confirm({
      title: 'Disconnect Helcim?',
      body: 'Saved credentials will be removed. You can reconnect at any time.',
      confirmLabel: 'Disconnect',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await api.del('/api/settings/payment-processors/helcim')
      toast.success('Helcim disconnected')
      await refresh()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const setActive = async (processor: PaymentProcessorName | null) => {
    try {
      await api.patch('/api/settings/payment-processors/active', { processor })
      toast.success(
        processor ? `Now using ${labelFor(processor)} for payments` : 'Payments paused',
      )
      await refresh()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (!state) {
    return (
      <div className="font-garamond text-[0.95rem] text-ink-muted">Loading…</div>
    )
  }

  return (
    <div>
      <p className="font-garamond text-[0.95rem] text-ink-muted mb-5 leading-[1.6]">
        Choose how your clients pay invoices. Funds go directly to your own
        merchant account — hejmae never holds your money and does not take a
        cut of payment volume. You can connect both and switch at any time.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <ProcessorCard
          title="Stripe"
          subtitle="Cards (V/MC/Amex/Discover), Apple Pay, Link, ACH. Lower-friction onboarding via Stripe Connect."
          connected={!!stripe}
          status={stripe?.status}
          external={stripe?.external_account_id}
          isActive={active === 'stripe'}
          canEdit={canEdit}
          onConnect={connectStripe}
          onContinue={connectStripe}
          onSetActive={() => setActive('stripe')}
          loading={loading}
        />

        <ProcessorCard
          title="Helcim"
          subtitle="Often cheaper card processing on larger invoices (interchange-plus). Sign up at helcim.com — 1–2 business day approval. Checkout flow coming soon."
          connected={!!helcim}
          status={helcim?.status}
          external={helcim?.external_account_id}
          isActive={active === 'helcim'}
          canEdit={canEdit}
          onSetActive={() => setActive('helcim')}
          onDisconnect={disconnectHelcim}
        >
          {!helcim ? (
            <div className="mt-4 space-y-3">
              <Field
                label="Helcim API token"
                hint="From your Helcim dashboard → Settings → API Access. Encrypted at rest."
              >
                <Input
                  type="password"
                  autoComplete="off"
                  value={helcimToken}
                  onChange={(e) => setHelcimToken(e.target.value)}
                  disabled={!canEdit}
                  placeholder="Paste your private API token"
                />
              </Field>
              <Field label="Helcim account id">
                <Input
                  value={helcimAccount}
                  onChange={(e) => setHelcimAccount(e.target.value)}
                  disabled={!canEdit}
                  placeholder="e.g. 1234567"
                />
              </Field>
              <Field
                label="Webhook verifier token (optional, can add later)"
                hint="Issued when you set up a webhook subscription in Helcim. Required to start accepting live payments — until then we can't verify Helcim's webhook signatures."
              >
                <Input
                  type="password"
                  autoComplete="off"
                  value={helcimWebhookVerifier}
                  onChange={(e) => setHelcimWebhookVerifier(e.target.value)}
                  disabled={!canEdit}
                  placeholder="From Helcim → Integrations → Webhooks"
                />
              </Field>
              <Button
                variant="primary"
                onClick={saveHelcim}
                loading={savingHelcim}
                disabled={!canEdit}
              >
                Save credentials
              </Button>
            </div>
          ) : (
            <div className="mt-4 font-garamond text-[0.85rem] text-ink-muted space-y-2">
              <div>
                Webhook URL — paste into Helcim → Integrations → Webhooks:
              </div>
              <code className="block break-all text-[0.8rem] bg-ink/[0.04] px-2 py-1 border border-line">
                {typeof window !== 'undefined' ? window.location.origin : ''}
                /api/webhooks/helcim
              </code>
            </div>
          )}
        </ProcessorCard>
      </div>

      {active ? (
        <div className="mt-5 space-y-3">
          <div className="font-garamond text-[0.9rem] text-ink-muted">
            Currently routing new invoices to{' '}
            <span className="text-ink">{labelFor(active)}</span>.
          </div>
          {active === 'helcim' ? (
            <Alert tone="warn" title="Helcim checkout is in beta">
              Clients will see a friendly “coming soon” message until the
              integration ships.
            </Alert>
          ) : null}
        </div>
      ) : (
        <Alert tone="warn" className="mt-5" title="No processor active">
          Clients can view invoices but cannot pay online.
        </Alert>
      )}
    </div>
  )
}

function ProcessorCard({
  title,
  subtitle,
  connected,
  status,
  external,
  isActive,
  canEdit,
  onConnect,
  onContinue,
  onSetActive,
  onDisconnect,
  loading,
  children,
}: {
  title: string
  subtitle: string
  connected: boolean
  status?: 'pending' | 'active' | 'disabled'
  external?: string
  isActive: boolean
  canEdit: boolean
  onConnect?: () => void
  onContinue?: () => void
  onSetActive?: () => void
  onDisconnect?: () => void
  loading?: boolean
  children?: React.ReactNode
}) {
  return (
    <SelectableCard as="div" selected={isActive}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="font-serif text-[1.2rem]">{title}</div>
        {isActive ? (
          <Badge tone="terra">Active</Badge>
        ) : connected ? (
          <Badge tone="neutral">Connected</Badge>
        ) : null}
      </div>
      <p className="font-garamond text-[0.9rem] text-ink-muted leading-[1.55] mb-4">
        {subtitle}
      </p>

      {connected ? (
        <div className="font-garamond text-[0.85rem] text-ink-muted mb-4 break-all">
          Account: <span className="font-mono">{external}</span>
          {status && status !== 'active' ? (
            <span className="ml-2 inline-block">
              <Badge tone="amber">{status}</Badge>
            </span>
          ) : null}
        </div>
      ) : null}

      {children}

      <div className="flex flex-wrap items-center gap-2 mt-4">
        {!connected && onConnect ? (
          <Button
            variant="primary"
            onClick={onConnect}
            loading={loading}
            disabled={!canEdit}
          >
            Connect {title}
          </Button>
        ) : null}
        {connected && onContinue ? (
          <Button
            variant="secondary"
            onClick={onContinue}
            loading={loading}
            disabled={!canEdit}
          >
            Continue onboarding
          </Button>
        ) : null}
        {connected && !isActive && onSetActive ? (
          <Button variant="primary" onClick={onSetActive} disabled={!canEdit}>
            Use this for payments
          </Button>
        ) : null}
        {connected && onDisconnect ? (
          <Button variant="ghost" onClick={onDisconnect} disabled={!canEdit}>
            Disconnect
          </Button>
        ) : null}
      </div>
    </SelectableCard>
  )
}

function labelFor(p: PaymentProcessorName): string {
  return p === 'stripe' ? 'Stripe' : 'Helcim'
}
