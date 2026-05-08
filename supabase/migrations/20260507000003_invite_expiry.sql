-- Add an expiry to studio invites.
--
-- Previously a pending invite was valid forever (until accepted or revoked),
-- which is a long replay window for a leaked token. 14 days matches the
-- expectation a recipient would have for an emailed invite link.
--
-- Existing un-accepted, un-revoked invites get a 14-day grace period from
-- now() so we don't break in-flight onboarding.

alter table public.studio_invites
  add column if not exists expires_at timestamptz;

update public.studio_invites
   set expires_at = greatest(invited_at, now()) + interval '14 days'
 where expires_at is null
   and accepted_at is null
   and revoked_at is null;

-- Future inserts default to invited_at + 14 days. We compute via a column
-- default rather than a trigger to keep the migration simple; the app code
-- writes invited_at = now() implicitly so this default lines up.
alter table public.studio_invites
  alter column expires_at set default (now() + interval '14 days');
