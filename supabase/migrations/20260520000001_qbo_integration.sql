-- QuickBooks Online integration: foundations.
--
-- One studio ↔ one QBO realm (QB's term for a company file). Refresh
-- tokens live encrypted at rest using AES-256-GCM with the existing
-- PAYMENT_SECRET_KEY master key — same scheme as payment_processor_secrets,
-- inlined here so the QBO column model can stay simple (one row per studio).
--
-- The external-ref table is the idempotency backbone for both push (sync
-- our writes up to QBO) and import (pull QBO entities down). Every QBO
-- side-effect resolves through it so reruns never double-create. Account
-- mappings (hejmae chart-of-accounts row ↔ QBO Account) are also stored
-- here with entity_type='account'.

-- ---------------------------------------------------------------------------
-- qbo_connections — one row per studio. status drives the UI.
-- ---------------------------------------------------------------------------

create table public.qbo_connections (
  id                       uuid primary key default gen_random_uuid(),
  designer_id              uuid not null references public.users(id) on delete cascade,
  realm_id                 text not null,
  -- Intuit environment the connection was made against. Stays here (not
  -- only in env) so a stale connection from sandbox is identifiable after
  -- the deployment flips to production.
  environment              text not null check (environment in ('sandbox', 'production')),
  status                   text not null default 'active'
                              check (status in ('active', 'revoked', 'expired')),
  -- AES-256-GCM blob for the refresh token. Intuit rotates the refresh
  -- token on every access-token refresh, so this column is rewritten often.
  refresh_token_ct         bytea not null,
  refresh_token_iv         bytea not null,
  refresh_token_tag        bytea not null,
  -- Refresh tokens currently expire 100 days after last use. We track the
  -- absolute expiry so a background job (out of scope for this PR) can warn
  -- studios before they get auto-disconnected.
  refresh_token_expires_at timestamptz,
  -- Cached access token + expiry. Optional — we can always derive a fresh
  -- one from the refresh token, but caching avoids a refresh round-trip on
  -- every API call when the cache is still warm.
  access_token_ct          bytea,
  access_token_iv          bytea,
  access_token_tag         bytea,
  access_token_expires_at  timestamptz,
  scopes                   text,
  connected_at             timestamptz not null default now(),
  last_refreshed_at        timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (designer_id)
);

create trigger qbo_connections_set_updated_at
  before update on public.qbo_connections
  for each row execute function public.set_updated_at();

alter table public.qbo_connections enable row level security;
alter table public.qbo_connections force  row level security;

-- Designers can see their own row exists; tokens are never returned by the
-- API (the row is read service-role from the Node layer). A narrow select
-- policy is still useful for future client-side status checks.
create policy qbo_connections_select_own on public.qbo_connections
  for select using (designer_id = public.current_designer_id());

grant select on public.qbo_connections to authenticated;
grant select, insert, update, delete on public.qbo_connections to service_role;

-- ---------------------------------------------------------------------------
-- qbo_external_refs — hejmae entity ↔ QBO entity mapping.
--
-- (designer_id, entity_type, hejmae_id) is the natural key. We also enforce
-- uniqueness on (designer_id, entity_type, qbo_id) so a single QBO entity
-- can never be claimed by two hejmae rows in the same studio.
--
-- qbo_sync_token mirrors Intuit's optimistic-concurrency token (every QBO
-- entity carries a SyncToken that must round-trip on updates).
-- ---------------------------------------------------------------------------

create table public.qbo_external_refs (
  id              uuid primary key default gen_random_uuid(),
  designer_id     uuid not null references public.users(id) on delete cascade,
  entity_type     text not null check (entity_type in (
                    'account', 'customer', 'vendor', 'item',
                    'invoice', 'payment', 'expense', 'journal_entry'
                  )),
  hejmae_id       text not null,
  qbo_id          text not null,
  qbo_sync_token  text,
  last_synced_at  timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (designer_id, entity_type, hejmae_id),
  unique (designer_id, entity_type, qbo_id)
);

create trigger qbo_external_refs_set_updated_at
  before update on public.qbo_external_refs
  for each row execute function public.set_updated_at();

create index qbo_external_refs_designer_idx
  on public.qbo_external_refs (designer_id);

alter table public.qbo_external_refs enable row level security;
alter table public.qbo_external_refs force  row level security;

create policy qbo_external_refs_select_own on public.qbo_external_refs
  for select using (designer_id = public.current_designer_id());

grant select on public.qbo_external_refs to authenticated;
grant select, insert, update, delete on public.qbo_external_refs to service_role;

-- ---------------------------------------------------------------------------
-- qbo_sync_log — per-entity attempt log. Errors surface in the settings UI.
-- ---------------------------------------------------------------------------

create table public.qbo_sync_log (
  id            uuid primary key default gen_random_uuid(),
  designer_id   uuid not null references public.users(id) on delete cascade,
  entity_type   text not null,
  hejmae_id     text,
  qbo_id        text,
  direction     text not null check (direction in ('push', 'pull')),
  status        text not null check (status in ('success', 'error')),
  error_code    text,
  error_message text,
  created_at    timestamptz not null default now()
);

create index qbo_sync_log_designer_created_idx
  on public.qbo_sync_log (designer_id, created_at desc);

create index qbo_sync_log_entity_idx
  on public.qbo_sync_log (designer_id, entity_type, hejmae_id);

alter table public.qbo_sync_log enable row level security;
alter table public.qbo_sync_log force  row level security;

create policy qbo_sync_log_select_own on public.qbo_sync_log
  for select using (designer_id = public.current_designer_id());

grant select on public.qbo_sync_log to authenticated;
grant select, insert, update, delete on public.qbo_sync_log to service_role;
