-- Make activity_logs append-only at the RLS layer.
--
-- The generic tenant policy generator in 20260501000002_rls_policies.sql and
-- the team-widening rewrite in 20260505000001_team_phase2.sql both produce
-- update + delete policies on activity_logs. That means a designer with
-- direct DB access (or anyone exploiting an RLS-respecting query path) could
-- rewrite or remove their own audit trail. Audit logs should be append-only
-- from the user's perspective; only the service role (which bypasses RLS)
-- gets to mutate them, and only for legitimate maintenance.

drop policy if exists activity_logs_update_team   on public.activity_logs;
drop policy if exists activity_logs_delete_team   on public.activity_logs;
-- Belt-and-suspenders: cover the pre-team_phase2 names too in case migrations
-- are replayed in a different order.
drop policy if exists activity_logs_update_own    on public.activity_logs;
drop policy if exists activity_logs_delete_own    on public.activity_logs;
