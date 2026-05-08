-- Stop retaining full Stripe webhook payloads.
--
-- The payload column previously stored the entire event JSON — including
-- customer email, last4, and billing address — indefinitely. Idempotency
-- (the only use case in this codebase) needs nothing beyond the event id
-- and a processed_at timestamp, so we:
--
--   1. Null out payloads older than 90 days right now.
--   2. App code is updated in the same release to stop writing payloads
--      on new events.
--
-- We keep the column rather than dropping it, so emergency debugging can
-- still capture a payload temporarily by toggling a feature flag.

-- Make the column nullable first; existing rows are not-null but we want
-- to clear them and stop writing in app code.
alter table public.stripe_events alter column payload drop not null;

update public.stripe_events
   set payload = null
 where payload is not null
   and received_at < now() - interval '90 days';

comment on column public.stripe_events.payload is
  'DEPRECATED: webhooks no longer persist payloads. Kept nullable for ad-hoc debug capture only.';
