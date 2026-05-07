-- Magic-link expiry. Limits the blast radius of a leaked invoice/proposal
-- link: even if a client forwards an email and that mailbox is later
-- compromised, the link stops working after the configured TTL.
--
-- App code (lib/portal/auth.ts) refuses any token with expires_at in the
-- past. The owning designer can rotate the token by re-sending; the
-- "send" endpoints set expires_at = now() + 90 days.

alter table public.invoices
  add column if not exists magic_link_expires_at timestamptz;

alter table public.proposals
  add column if not exists magic_link_expires_at timestamptz;

-- Backfill: any already-sent link that hasn't been revoked gets 90 days
-- from its original sent_at. Drafts (no sent_at) stay null and will be
-- populated on first send.
update public.invoices
   set magic_link_expires_at = sent_at + interval '90 days'
 where sent_at is not null
   and magic_link_token is not null
   and magic_link_expires_at is null;

update public.proposals
   set magic_link_expires_at = sent_at + interval '90 days'
 where sent_at is not null
   and magic_link_token is not null
   and magic_link_expires_at is null;
