-- Phase-2 of multi-user studios: team members can now see and act on the
-- studio owner's data.
--
-- Tenant model: every tenant row's `designer_id` continues to point at the
-- studio owner's `users.id`. We did NOT rename the column — keeping
-- `designer_id` avoids touching every table, type, and route. Read it as
-- "studio owner id".
--
-- The mechanism: a new `current_designer_ids()` set-returning helper resolves
-- the caller's accessible studio-owner ids (their own + any studio they belong
-- to as a member). RLS policies on tenant tables widen from `= current id` to
-- `IN current ids`.
--
-- Per-user feature gates (e.g. finances, bookkeeping) live in API routes —
-- RLS stays studio-scoped. We add a `permissions` jsonb on studio_members
-- so the API has somewhere to look.

-- ===========================================================================
-- 1. Permissions columns on studio_members + studio_invites
-- ===========================================================================
-- JSONB array of permission strings. Empty = no extra grants beyond base
-- member access. Owners always pass every check (enforced in code).
alter table public.studio_members
  add column if not exists permissions jsonb not null default '[]'::jsonb;

alter table public.studio_members
  drop constraint if exists studio_members_permissions_is_array;
alter table public.studio_members
  add constraint studio_members_permissions_is_array
  check (jsonb_typeof(permissions) = 'array');

-- Mirror on invites so the inviter can specify per-feature grants up front;
-- they're copied onto the studio_members row at accept-time.
alter table public.studio_invites
  add column if not exists permissions jsonb not null default '[]'::jsonb;

alter table public.studio_invites
  drop constraint if exists studio_invites_permissions_is_array;
alter table public.studio_invites
  add constraint studio_invites_permissions_is_array
  check (jsonb_typeof(permissions) = 'array');

-- ===========================================================================
-- 2. current_designer_ids() — set of studio-owner ids accessible to caller
-- ===========================================================================
-- Returns:
--   * the caller's own users.id (so their own one-person studio + any rows
--     they personally own keep working), and
--   * the owner_user_id of every studio they are an active member of
--     (joined_at not null is implicit; we have no soft-delete on members).
--
-- SECURITY DEFINER + locked search_path so RLS on users / studio_members
-- doesn't recursively block this lookup.
create or replace function public.current_designer_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select u.id
      from public.users u
     where u.clerk_user_id = coalesce(
       auth.jwt() ->> 'sub',
       auth.jwt() -> 'user' ->> 'id'
     )
     limit 1
  )
  select id from me
  union
  select s.owner_user_id
    from public.studios s
    join public.studio_members m on m.studio_id = s.id
   where m.user_id = (select id from me);
$$;

revoke all on function public.current_designer_ids() from public;
grant execute on function public.current_designer_ids()
  to anon, authenticated, service_role;

-- ===========================================================================
-- 3. Rewrite tenant RLS policies to use current_designer_ids()
-- ===========================================================================
-- Drops the *_own policies created in 20260501000002_rls_policies.sql and
-- 20260504000002_v2_features.sql, then recreates widened versions.

do $$
declare
  t text;
  s text;
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
    'activity_logs',
    'time_entries'
  ];
  ops text[] := array['select','insert','update','delete'];
begin
  foreach t in array tbls loop
    foreach s in array ops loop
      execute format(
        'drop policy if exists %I on public.%I',
        t || '_' || s || '_own', t
      );
    end loop;

    execute format($f$
      create policy %I on public.%I
        for select
        using (designer_id in (select public.current_designer_ids()));
    $f$, t || '_select_team', t);

    execute format($f$
      create policy %I on public.%I
        for insert
        with check (designer_id in (select public.current_designer_ids()));
    $f$, t || '_insert_team', t);

    execute format($f$
      create policy %I on public.%I
        for update
        using (designer_id in (select public.current_designer_ids()))
        with check (designer_id in (select public.current_designer_ids()));
    $f$, t || '_update_team', t);

    execute format($f$
      create policy %I on public.%I
        for delete
        using (designer_id in (select public.current_designer_ids()));
    $f$, t || '_delete_team', t);
  end loop;
end $$;

-- ===========================================================================
-- 4. users — let teammates see each other's profile rows
-- ===========================================================================
-- The team settings page lists teammates by name/email, so a member needs to
-- read other studio members' user rows. Self-update policy is unchanged.
drop policy if exists users_select_team on public.users;
create policy users_select_team on public.users
  for select using (
    id = public.current_designer_id()
    or exists (
      select 1
        from public.studio_members me
        join public.studio_members them on them.studio_id = me.studio_id
       where me.user_id = public.current_designer_id()
         and them.user_id = public.users.id
    )
  );

-- The original users_select_self is now redundant with users_select_team
-- (which already covers the self case). Drop it to avoid two policies doing
-- the same work.
drop policy if exists users_select_self on public.users;
