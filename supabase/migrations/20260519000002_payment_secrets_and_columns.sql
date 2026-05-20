-- Encrypted secret storage for payment processors + per-payment processor stamps.
--
-- (1) payment_processor_secrets
--     Holds AES-256-GCM encrypted blobs (api tokens, webhook verifier tokens)
--     keyed by (account, name). Service-role only — never readable from the
--     designer-facing PostgREST surface. Encryption / decryption happens in
--     the Node layer using the PAYMENT_SECRET_KEY env var as the master key;
--     this table only ever sees ciphertext.
--
-- (2) payments.processor / processor_charge_id
--     The Stripe-only payments row carried `stripe_charge_id` as the refund
--     anchor. Helcim returns a numeric `transactionId`; rather than overload
--     stripe_charge_id, add generic columns. Backfill assumes legacy rows
--     are Stripe (matches the v1 single-processor world).

-- ---------------------------------------------------------------------------
-- payment_processor_secrets
-- ---------------------------------------------------------------------------

create table public.payment_processor_secrets (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references public.payment_processor_accounts(id) on delete cascade,
  name              text not null,
  -- AES-256-GCM components. All three are required to decrypt.
  ciphertext        bytea not null,
  iv                bytea not null,
  auth_tag          bytea not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (account_id, name)
);

create trigger payment_processor_secrets_set_updated_at
  before update on public.payment_processor_secrets
  for each row execute function public.set_updated_at();

create index payment_processor_secrets_account_idx
  on public.payment_processor_secrets (account_id);

-- Service-role only. No RLS policies → no designer-facing access.
alter table public.payment_processor_secrets enable row level security;
alter table public.payment_processor_secrets force  row level security;

-- ---------------------------------------------------------------------------
-- payments.processor + processor_charge_id
-- ---------------------------------------------------------------------------

alter table public.payments
  add column processor          text
    check (processor in ('stripe', 'helcim')),
  add column processor_charge_id text;

create index payments_processor_charge_idx
  on public.payments (processor_charge_id);

-- Backfill: every existing payments row is Stripe.
update public.payments
   set processor           = 'stripe',
       processor_charge_id = stripe_charge_id
 where processor is null;

-- ---------------------------------------------------------------------------
-- helcim_events — idempotency log for the Helcim webhook handler.
-- Mirrors public.stripe_events; kept as a separate table so the per-processor
-- handler can index / vacuum independently.
-- ---------------------------------------------------------------------------

create table public.helcim_events (
  id            text primary key,
  type          text not null,
  account_id    text,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz
);

create index helcim_events_account_idx on public.helcim_events (account_id);
create index helcim_events_type_idx    on public.helcim_events (type);

-- Service-role only (matches stripe_events).
alter table public.helcim_events enable row level security;
alter table public.helcim_events force  row level security;

-- ---------------------------------------------------------------------------
-- Move any plaintext Helcim API tokens out of payment_processor_accounts.config
-- ---------------------------------------------------------------------------
--
-- The first Helcim-credential migration stored tokens in the `config` jsonb.
-- That column is now reserved for non-secret pointers. There may not be any
-- production rows yet, but the move is idempotent — we strip api_token from
-- config defensively so a later read can't accidentally use the plaintext.
-- The Node layer's secrets module is what writes the encrypted replacement;
-- this SQL only clears the old location.

update public.payment_processor_accounts
   set config = config - 'api_token'
 where processor = 'helcim'
   and config ? 'api_token';
