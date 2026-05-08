-- Soft-delete users on Clerk user.deleted instead of hard-deleting.
--
-- Hard-delete cascades through projects/proposals/invoices/payments —
-- destroying financial records the designer (or their estate, or
-- regulators) may need. A misfired webhook or a hijacked Clerk admin
-- session would be irreversible. We switch to a tombstone marker.
--
-- Trade-offs:
--   * email + clerk_user_id are UNIQUE NOT NULL. To free those values for
--     a future re-signup with the same address, the webhook handler
--     anonymizes them on soft-delete (prefixed with 'deleted_<id>_').
--   * `requireDesigner()` and the Clerk JWT helpers will stop matching
--     a deleted user (their Clerk session is revoked anyway), but we add
--     `deleted_at` so app code and analytics can filter explicitly.

alter table public.users
  add column if not exists deleted_at timestamptz;

create index if not exists users_deleted_at_idx
  on public.users (deleted_at)
  where deleted_at is not null;

comment on column public.users.deleted_at is
  'Tombstone set by the Clerk user.deleted webhook. When non-null, email/clerk_user_id have been anonymized to free those unique slots.';
