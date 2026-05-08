-- Hash magic-link and invite tokens at rest.
--
-- Threat model: a read-only DB leak (replica access, backup, log capture)
-- previously handed an attacker live portal access for every unrevoked
-- invoice/proposal and every pending studio invite. After this migration the
-- DB only stores SHA-256(token) — the raw token is known only to the
-- recipient (via email/clipboard) until they redeem it.
--
-- Migration steps:
--   1. enable pgcrypto for digest()
--   2. rewrite existing plaintext tokens in place to lower-hex SHA-256
--   3. app code is updated in the same release to hash on write/lookup
--
-- The columns keep their existing names; their *contents* are now hashes.
-- Any process that compares against the column must hash its input first.

create extension if not exists pgcrypto;

update public.proposals
   set magic_link_token = encode(digest(magic_link_token, 'sha256'), 'hex')
 where magic_link_token is not null
   and magic_link_token !~ '^[0-9a-f]{64}$';

update public.invoices
   set magic_link_token = encode(digest(magic_link_token, 'sha256'), 'hex')
 where magic_link_token is not null
   and magic_link_token !~ '^[0-9a-f]{64}$';

update public.studio_invites
   set token = encode(digest(token, 'sha256'), 'hex')
 where token is not null
   and token !~ '^[0-9a-f]{64}$';

comment on column public.proposals.magic_link_token is
  'lower-hex SHA-256 of the raw token. Raw token never persisted.';
comment on column public.invoices.magic_link_token is
  'lower-hex SHA-256 of the raw token. Raw token never persisted.';
comment on column public.studio_invites.token is
  'lower-hex SHA-256 of the raw token. Raw token never persisted.';
