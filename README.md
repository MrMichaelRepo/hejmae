# hejmae

SaaS platform for small interior design studios. Project specs, client proposals/invoices with Stripe payments, vendor POs, bookkeeping, clippings inbox, and an AI-powered master catalog — replacing Studio Designer + QuickBooks in one tool.

Next.js 15 (App Router) · React 18 · TypeScript strict · Tailwind · Supabase (Postgres + pgvector) · Clerk · Stripe Connect · Resend · OpenAI + Anthropic.

```bash
npm install
npm run dev
```

Required env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`. Optional: `RESEND_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `CRON_SECRET`, `ADMIN_ALERT_EMAIL`, `PAYMENT_SECRET_KEY` (required to connect Helcim — see below).

---

## TODO — multi-processor payments (shipped 2026-05-19)

Stripe is live. Helcim is code-complete and typechecks clean but has not been exercised against a Helcim sandbox — the REST shapes, webhook signature scheme, and HelcimPay.js postMessage shapes were coded from documentation rather than verified end-to-end. Open work before Helcim goes live:

### Deployment / wiring
- [ ] **Apply the three migrations**: `20260519000001_payment_processors.sql`, `20260519000002_payment_secrets_and_columns.sql`, `20260519000003_payment_refunds_processor.sql` (push via `supabase db push` or your usual migration path).
- [ ] **Generate and set `PAYMENT_SECRET_KEY` in prod**. Master key for encrypting Helcim API tokens + webhook verifier tokens at rest (AES-256-GCM). Must decode to 32 bytes:
  ```bash
  openssl rand -base64 32
  ```
  Helcim onboarding refuses with a clear error if missing. Stripe still works without it.
- [ ] **Designer onboarding flow** once live:
  1. Sign up at helcim.com → wait for approval (1–2 business days).
  2. In Helcim dashboard → Settings → API Access, copy the API token + account id.
  3. In Helcim dashboard → Integrations → Webhooks, create a subscription pointing to `{appUrl}/api/webhooks/helcim`. Copy the webhook verifier token.
  4. In hejmae Settings → Payments → Helcim card: paste API token, account id, verifier. Click "Use this for payments".

### Sandbox verification (BEFORE turning Helcim on for real customers)
Three spots in code marked `NEEDS SANDBOX VERIFICATION`. Run a full purchase + refund cycle in Helcim's sandbox and confirm:
- [ ] **REST shapes** in [lib/payments/helcim-client.ts](lib/payments/helcim-client.ts) — `/helcim-pay/initialize`, `/payment/refund`, `/card-transactions/{id}` request + response field names. Helcim has shifted between camelCase and snake_case across versions.
- [ ] **Webhook signature** in [app/api/webhooks/helcim/route.ts](app/api/webhooks/helcim/route.ts) — assumed header `webhook-signature` + scheme `hex(HMAC_SHA256(verifier, raw_body))`. May actually be Stripe-style `t=…,v1=…`. Adjust `verifySignature()` once confirmed.
- [ ] **HelcimPay.js integration** in [app/portal/invoices/[token]/HelcimPaymentForm.tsx](app/portal/invoices/[token]/HelcimPaymentForm.tsx) — loader script URL `https://secure.helcim.app/helcim-pay/services/start.js` and the `eventStatus` values HelcimPay's postMessage emits (`SUCCESS` / `APPROVED` / `ABORTED` / `ERROR` assumed).

### Follow-ups
- [ ] **Drop legacy Stripe-specific columns** once the dual-write window closes: `users.stripe_account_id`, `invoices.stripe_account_id`, `invoices.stripe_payment_intent_id`, `payment_refunds.stripe_refund_id`. The Stripe-Connect webhook + `recordInvoicePaymentInit` write both old + new today; remove the legacy writes first, then a follow-up migration drops the columns.
- [ ] **Helcim refund webhook** — refunds currently decrement `payments.amount_cents` synchronously in the refund route because we don't subscribe to Helcim's refund events. If we ever add a subscription, mirror the Stripe `charge.refunded` flow and remove the sync decrement to avoid double-counting.
- [ ] **Per-merchant secret rotation** — `PAYMENT_SECRET_KEY` rotation requires re-encrypting every row in `payment_processor_secrets`. Document a rotation script before the first time we need to do it.
- [ ] **Surface Helcim onboarding readiness in the UI** — today the Helcim card silently accepts the API token even if `PAYMENT_SECRET_KEY` is missing on the server; the failure surfaces as a generic error. Pre-check the env via `GET /api/settings/payment-processors` and disable the Helcim form with a clear message when the key isn't set.

---

## Reference

- Architecture & conventions live in the auto-memory (`project_hejmae_architecture.md`).
- Per-feature notes: clippings, catalog image search, catalog admin & duplicates.
- Migrations: `supabase/migrations/`.
- Sibling repo: Chrome clipper at `../hejmae-clipper`.
