-- Invoice email drafts + edit + reminder + void/refund.
--
-- This migration adds the schema for:
-- a) Editable email drafts on Send/Resend/Reminder (subject + body persisted
--    per send to invoices.email_drafts JSONB; latest cached on the row).
-- b) Studio-level default for invoice email drafting mode (template vs AI).
-- c) Voiding invoices (status='void' + audit fields).
-- d) Partial/full Stripe refunds tracked in a typed table
--    (payment_refunds) so journal-entry idempotency keys cleanly.
--
-- The inbound `charge.refunded` Stripe Connect webhook in
-- app/api/webhooks/stripe-connect/route.ts already reconciles
-- payments.amount_cents to the net captured amount and emits
-- an `invoice.refunded` activity log row. We mirror the cumulative
-- refunded amount on invoices.refunded_cents for fast dashboard math.

-- ---------------------------------------------------------------------------
-- a) Extend invoice_status enum: add 'void'.
-- ---------------------------------------------------------------------------
alter type public.invoice_status add value if not exists 'void';

-- ---------------------------------------------------------------------------
-- b) Extend journal_source_type enum: invoice refunds + voids.
-- ---------------------------------------------------------------------------
alter type public.journal_source_type add value if not exists 'invoice_refund';
alter type public.journal_source_type add value if not exists 'invoice_void';

-- ---------------------------------------------------------------------------
-- c) Invoice columns: email-draft log + void audit + refund denormalization.
--    email_drafts shape (JSONB array, append-only in API code):
--    [{
--      kind: 'initial' | 'reminder',
--      subject, body_html,
--      recipients: text[], cc: text[], reply_to: text|null,
--      sent_at: iso8601, sent_by: uuid,
--      email_id: text|null   -- Resend message id
--    }, ...]
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column if not exists email_drafts         jsonb       not null default '[]'::jsonb,
  add column if not exists email_send_count     int         not null default 0,
  add column if not exists last_email_subject   text,
  add column if not exists last_email_body_html text,
  add column if not exists voided_at            timestamptz,
  add column if not exists void_reason          text,
  add column if not exists refunded_cents       bigint      not null default 0
    check (refunded_cents >= 0);

-- ---------------------------------------------------------------------------
-- d) Studios: default invoice email drafting mode.
-- ---------------------------------------------------------------------------
alter table public.studios
  add column if not exists default_invoice_email_mode text not null default 'template'
    check (default_invoice_email_mode in ('template', 'ai'));

-- ---------------------------------------------------------------------------
-- e) payment_refunds: one row per refund (partial or full).
--    Idempotency: stripe_refund_id is unique, so the inbound
--    `charge.refunded` webhook can upsert without duplicating ledger lines.
-- ---------------------------------------------------------------------------
create table if not exists public.payment_refunds (
  id                  uuid primary key default gen_random_uuid(),
  designer_id         uuid not null references public.users(id) on delete cascade,
  invoice_id          uuid not null references public.invoices(id) on delete cascade,
  payment_id          uuid not null references public.payments(id) on delete cascade,
  amount_cents        bigint not null check (amount_cents > 0),
  stripe_refund_id    text unique,
  reason              text,
  created_at          timestamptz not null default now()
);

create index if not exists payment_refunds_invoice_idx
  on public.payment_refunds (invoice_id);
create index if not exists payment_refunds_designer_idx
  on public.payment_refunds (designer_id);
create index if not exists payment_refunds_payment_idx
  on public.payment_refunds (payment_id);

-- ---------------------------------------------------------------------------
-- f) RLS: tenant isolation. Matches the generic owner policies from
--    20260501000002_rls_policies.sql — uses public.current_designer_id().
-- ---------------------------------------------------------------------------
alter table public.payment_refunds enable row level security;
alter table public.payment_refunds force row level security;

create policy payment_refunds_select_own on public.payment_refunds
  for select using (designer_id = public.current_designer_id());

create policy payment_refunds_insert_own on public.payment_refunds
  for insert with check (designer_id = public.current_designer_id());

create policy payment_refunds_update_own on public.payment_refunds
  for update using (designer_id = public.current_designer_id())
              with check (designer_id = public.current_designer_id());

create policy payment_refunds_delete_own on public.payment_refunds
  for delete using (designer_id = public.current_designer_id());

-- ---------------------------------------------------------------------------
-- Comments (self-documenting schema for the UI/types layer).
-- ---------------------------------------------------------------------------
comment on column public.invoices.email_drafts is
  'Append-only JSONB log of every email send (initial + reminders). Latest entry mirrored to last_email_subject/last_email_body_html for fast prefill on resend.';
comment on column public.invoices.refunded_cents is
  'Cumulative refunded amount in cents. Source of truth is the sum of payment_refunds.amount_cents for this invoice; this column is a denormalized cache updated by the refund route and the charge.refunded webhook.';
comment on column public.studios.default_invoice_email_mode is
  'Studio default for the invoice Send modal: ''template'' (deterministic prefill) or ''ai'' (Claude-drafted). The Send modal always exposes a ✨ Rewrite-with-AI override regardless of this value.';
comment on table public.payment_refunds is
  'One row per Stripe refund (partial or full). stripe_refund_id is unique so the charge.refunded webhook can upsert idempotently.';
