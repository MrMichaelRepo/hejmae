-- Row-Level Security policies for hejmae.
--
-- Auth model: Clerk JWT is configured as a third-party auth provider in
-- Supabase. Clerk emits a JWT whose `sub` claim is the Clerk user id. We map
-- that to public.users.id via users.clerk_user_id.
--
-- Defense in depth: server API routes also validate ownership using the
-- service role + explicit designer_id checks. RLS is the second wall, in
-- case a route ever uses the anon key directly or a row leaks via a view.

-- ---------------------------------------------------------------------------
-- JWT helper: returns the public.users.id for the currently-authenticated
-- Clerk user, or NULL if there is no JWT or no matching user.
--
-- Marked SECURITY DEFINER so it can read users when the caller's RLS would
-- otherwise hide it. Locked down with `set search_path = ''` to prevent
-- search-path hijacking.
-- ---------------------------------------------------------------------------

create or replace function public.current_designer_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
    from public.users u
   where u.clerk_user_id = coalesce(
     auth.jwt() ->> 'sub',
     -- some Clerk JWT templates put the user id under a custom claim
     auth.jwt() -> 'user' ->> 'id'
   )
   limit 1;
$$;

revoke all on function public.current_designer_id() from public;
grant execute on function public.current_designer_id() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enable RLS on every tenant table
-- ---------------------------------------------------------------------------

alter table public.users                     enable row level security;
alter table public.clients                   enable row level security;
alter table public.projects                  enable row level security;
alter table public.rooms                     enable row level security;
alter table public.catalog_products          enable row level security;
alter table public.items                     enable row level security;
alter table public.proposals                 enable row level security;
alter table public.proposal_rooms            enable row level security;
alter table public.invoices                  enable row level security;
alter table public.invoice_line_items        enable row level security;
alter table public.payments                  enable row level security;
alter table public.purchase_orders           enable row level security;
alter table public.purchase_order_line_items enable row level security;
alter table public.activity_logs             enable row level security;
alter table public.stripe_events             enable row level security;

-- Force RLS so even table owners obey policies (the service role still
-- bypasses RLS — that's the documented Supabase behavior).
alter table public.users                     force row level security;
alter table public.clients                   force row level security;
alter table public.projects                  force row level security;
alter table public.rooms                     force row level security;
alter table public.catalog_products          force row level security;
alter table public.items                     force row level security;
alter table public.proposals                 force row level security;
alter table public.proposal_rooms            force row level security;
alter table public.invoices                  force row level security;
alter table public.invoice_line_items        force row level security;
alter table public.payments                  force row level security;
alter table public.purchase_orders           force row level security;
alter table public.purchase_order_line_items force row level security;
alter table public.activity_logs             force row level security;
alter table public.stripe_events             force row level security;

-- ---------------------------------------------------------------------------
-- users — a designer can read/update only their own row.
-- INSERTs happen via the service role on the Clerk webhook.
-- ---------------------------------------------------------------------------

create policy users_select_self on public.users
  for select using (id = public.current_designer_id());

create policy users_update_self on public.users
  for update using (id = public.current_designer_id())
  with check (id = public.current_designer_id());

-- ---------------------------------------------------------------------------
-- Generic owner policies for tenant tables (designer_id = current designer).
-- We generate the same four policies for each table.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
  tbls text[] := array[
    'clients',
    'projects',
    'rooms',
    'items',
    'proposals',
    'proposal_rooms',
    'invoices',
    'invoice_line_items',
    'payments',
    'purchase_orders',
    'purchase_order_line_items',
    'activity_logs'
  ];
begin
  foreach t in array tbls loop
    execute format($f$
      create policy %I on public.%I
        for select
        using (designer_id = public.current_designer_id());
    $f$, t || '_select_own', t);

    execute format($f$
      create policy %I on public.%I
        for insert
        with check (designer_id = public.current_designer_id());
    $f$, t || '_insert_own', t);

    execute format($f$
      create policy %I on public.%I
        for update
        using (designer_id = public.current_designer_id())
        with check (designer_id = public.current_designer_id());
    $f$, t || '_update_own', t);

    execute format($f$
      create policy %I on public.%I
        for delete
        using (designer_id = public.current_designer_id());
    $f$, t || '_delete_own', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- catalog_products — shared (anonymized) read; any authenticated designer can
-- read. Writes happen server-side via service role (catalog write-on-add).
-- ---------------------------------------------------------------------------

create policy catalog_select_all on public.catalog_products
  for select using (public.current_designer_id() is not null);

-- No insert/update/delete policies for catalog_products → only service role
-- (which bypasses RLS) can write. This keeps designers from clobbering shared
-- catalog rows directly.

-- ---------------------------------------------------------------------------
-- stripe_events — service role only. No designer policies.
-- ---------------------------------------------------------------------------

-- (no policies → no access for anon/authenticated)

-- ---------------------------------------------------------------------------
-- Notes for client portal:
--
-- The client portal does NOT use Clerk and therefore does not satisfy
-- current_designer_id(). All portal access goes through server API routes
-- using the service role, which:
--   1. validates the magic-link token in code
--   2. queries the row scoped to that token
--   3. SANITIZES the response — trade_price fields are stripped before
--      anything is returned to the client.
--
-- We deliberately do NOT add an RLS policy that exposes proposals/invoices
-- by token, because keeping the bypass in code makes it impossible to
-- accidentally leak trade_price via a SELECT *.
-- ---------------------------------------------------------------------------
