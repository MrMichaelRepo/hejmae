# hejmae

SaaS platform for small interior design studios. Project specs, client proposals/invoices with Stripe payments, vendor POs, bookkeeping, clippings inbox, and an AI-powered master catalog — replacing Studio Designer + QuickBooks in one tool.

Next.js 15 (App Router) · React 18 · TypeScript strict · Tailwind · Supabase (Postgres + pgvector) · Clerk · Stripe Connect · Resend · OpenAI + Anthropic.

```bash
npm install
npm run dev
```

Required env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`. Optional: `RESEND_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `CRON_SECRET`, `ADMIN_ALERT_EMAIL`.

---

## TODO — catalog admin & duplicate detection (shipped 2026-05-14)

The feature is code-complete and typechecks clean. Open work before it's live:

### Deployment / wiring
- [ ] **Apply the migration**: `supabase/migrations/20260514000003_catalog_admin_and_duplicates.sql` (push via `supabase db push` or your usual migration path).
- [ ] **Set env vars in prod**: `CRON_SECRET` (required, any high-entropy string) and `ADMIN_ALERT_EMAIL` (optional, defaults to the Resend From address).
- [ ] **Promote the first admin** — there is no self-serve. Run in Supabase SQL:
  ```sql
  update public.users set role = 'admin' where email = 'you@hejmae.com';
  ```
- [ ] **Schedule the weekly scan via Supabase `pg_cron` + `pg_net`** (enable the extensions if you haven't). The URL varies per environment so it's not in a migration:
  ```sql
  -- one-time: stash the secret so the cron job doesn't carry it in plaintext.
  alter database postgres set "app.cron_secret" to '<your CRON_SECRET>';

  select cron.schedule(
    'catalog-duplicate-scan',
    '0 6 * * 1',   -- every Monday 06:00 UTC
    $$ select net.http_post(
      url := 'https://app.hejmae.com/api/cron/catalog-duplicate-scan',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || current_setting('app.cron_secret')
      )
    ) $$
  );
  ```
  Smoke-test by running `select cron.schedule(...);` then `select net.http_post(...);` manually.
- [ ] **Verify the admin gate** end-to-end: a non-admin Clerk session hitting `/admin/duplicates` should see a 404, and `/api/admin/*` should 403.

### Data hygiene
- [ ] **Backfill embeddings** for any rows that pre-date the description/item_type fields:
  ```bash
  npm run backfill:embeddings
  ```
  The script now selects `description` + `item_type` and skips merged/deleted rows.
- [ ] **First-run scan**: trigger the cron endpoint once manually before Monday to populate `last_seen_at` for the existing catalog. Browser-friendly:
  ```
  curl -H "Authorization: Bearer $CRON_SECRET" https://app.hejmae.com/api/cron/catalog-duplicate-scan
  ```

### Tuning / follow-ups
- [ ] **Similarity threshold (0.8)** and the ±10% price tolerance are hardcoded in [lib/admin/duplicate-scan.ts](lib/admin/duplicate-scan.ts). Revisit after a few weeks of real flag review — too noisy → raise to 0.85; too quiet → drop to 0.75.
- [ ] **Activity log on merge** — the merge transaction doesn't currently insert into `activity_logs`. If we want an audit trail beyond the flag row itself, add an insert at the end of `merge_catalog_duplicate(...)`.
- [ ] **CompareModal "Merge now"** uses a 2-step API call (flag → merge). The flag step is idempotent, so it's safe, but it's not atomic. If we ever see partial failures in the wild, fold both into a single `/api/admin/duplicates/merge-or-flag-and-merge` route.
- [ ] **Rate-limit admin search** — `/api/admin/catalog` and `/api/admin/catalog/:id/regenerate-embedding` are uncapped. Low risk (admin-only) but the regenerate route burns an OpenAI call per click. Add an `adminWrite` bucket if it becomes a thing.
- [ ] **Surface an "Admin" link** in the regular dashboard nav for users where `role === 'admin'`, so admins don't have to type `/admin` by hand.
- [ ] **Test the merge transaction** against a real `items` + `clipping_items` re-point with non-trivial volumes. Verify nothing else holds an FK to `catalog_products.id` that we forgot to re-point.

---

## Reference

- Architecture & conventions live in the auto-memory (`project_hejmae_architecture.md`).
- Per-feature notes: clippings, catalog image search, catalog admin & duplicates.
- Migrations: `supabase/migrations/`.
- Sibling repo: Chrome clipper at `../hejmae-clipper`.
