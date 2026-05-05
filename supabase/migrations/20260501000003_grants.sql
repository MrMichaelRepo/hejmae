-- Grant table/function/sequence privileges to the standard Supabase roles.
--
-- Why this exists: legacy Supabase projects auto-granted these on every new
-- table via project-wide default privileges. With the new (2025) API key
-- system, that default behavior changed — service_role and authenticated
-- now need explicit grants for tables created in earlier migrations.
-- Without this, queries via the secret key fail with:
--   "permission denied for table <name>" (SQLSTATE 42501)
--
-- Run this after the schema + RLS migrations.

-- Schema usage --------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

-- service_role: full access on existing objects. RLS still applies but the
-- Supabase secret key authenticates as a role that bypasses RLS by default.
grant all on all tables       in schema public to service_role;
grant all on all sequences    in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- authenticated: CRUD on tenant tables; RLS policies filter rows.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- anon: read-only access to the shared catalog (RLS policy still applies).
grant select on public.catalog_products to anon;

-- Default privileges for FUTURE objects, so we never have to come back here
-- when a later migration adds a table.
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant all on sequences to service_role;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;
alter default privileges in schema public
  grant execute on functions to service_role, authenticated;
