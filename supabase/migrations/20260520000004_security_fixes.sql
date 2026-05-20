-- Security-review follow-ups.
--
-- (1) journal_entries.last_modified_by_user_id — capture which user
--     authored the latest write. The audit history trigger reads from this
--     so the trail records WHO, not just WHAT.
--     Manual JEs populate it via the create_manual_journal_entry RPC
--     (caller passes the user id). Auto-posted JEs (from expense / mileage
--     / payment triggers) stay NULL — the source row's audit context is
--     what you'd consult for those.
--
-- (2) create_manual_journal_entry gains a p_actor_user_id parameter.
--
-- (3) snapshot_journal_entry trigger writes changed_by_user_id from
--     new.last_modified_by_user_id (or NULL on DELETE).
--
-- (4) Audit-trail comment fix on the period-lock trigger (no schema change).

-- ---------------------------------------------------------------------------
-- (1) Column
-- ---------------------------------------------------------------------------

alter table public.journal_entries
  add column last_modified_by_user_id uuid references public.users(id) on delete set null;

-- ---------------------------------------------------------------------------
-- (2) Replace create_manual_journal_entry — add p_actor_user_id.
-- The four-arg version is kept as a thin shim so existing callers don't break
-- mid-deploy; it forwards p_actor_user_id = NULL.
-- ---------------------------------------------------------------------------

create or replace function public.create_manual_journal_entry(
  p_designer_id    uuid,
  p_entry_date     date,
  p_memo           text,
  p_lines          jsonb,
  p_actor_user_id  uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry_id   uuid;
  v_line       jsonb;
  v_account_id uuid;
  v_acct_owner uuid;
  v_amount     bigint;
  v_pos        int := 0;
  v_count      int;
begin
  if p_designer_id is null then
    raise exception 'designer_id required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_lines) <> 'array' then
    raise exception 'lines must be a JSON array' using errcode = '22023';
  end if;

  v_count := jsonb_array_length(p_lines);
  if v_count < 2 then
    raise exception 'A journal entry needs at least 2 lines' using errcode = '23514';
  end if;

  insert into public.journal_entries
    (designer_id, entry_date, memo, source_type, source_id, last_modified_by_user_id)
  values
    (p_designer_id, p_entry_date, nullif(p_memo, ''), 'manual', null, p_actor_user_id)
  returning id into v_entry_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_account_id := (v_line->>'account_id')::uuid;
    v_amount     := (v_line->>'amount_cents')::bigint;
    if v_account_id is null then
      raise exception 'Each line requires account_id' using errcode = '23502';
    end if;
    if v_amount is null or v_amount = 0 then
      raise exception 'Each line requires a non-zero amount_cents' using errcode = '23514';
    end if;

    select designer_id into v_acct_owner from public.accounts where id = v_account_id;
    if v_acct_owner is null then
      raise exception 'Account % not found', v_account_id using errcode = '23503';
    end if;
    if v_acct_owner <> p_designer_id then
      raise exception 'Account does not belong to designer' using errcode = '42501';
    end if;

    insert into public.journal_lines
      (designer_id, entry_id, account_id, project_id, amount_cents, memo, position)
    values (
      p_designer_id,
      v_entry_id,
      v_account_id,
      nullif(v_line->>'project_id', '')::uuid,
      v_amount,
      nullif(v_line->>'memo', ''),
      v_pos
    );
    v_pos := v_pos + 1;
  end loop;

  return v_entry_id;
end;
$$;

revoke all on function public.create_manual_journal_entry(uuid, date, text, jsonb, uuid) from public;
grant execute on function public.create_manual_journal_entry(uuid, date, text, jsonb, uuid)
  to service_role;

-- Back-compat shim: 4-arg version delegates to the 5-arg with actor=NULL.
-- Kept so a code path the deploy missed doesn't 500.
create or replace function public.create_manual_journal_entry(
  p_designer_id uuid,
  p_entry_date  date,
  p_memo        text,
  p_lines       jsonb
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.create_manual_journal_entry(p_designer_id, p_entry_date, p_memo, p_lines, null);
$$;

grant execute on function public.create_manual_journal_entry(uuid, date, text, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- (3) History trigger now copies last_modified_by_user_id.
-- ---------------------------------------------------------------------------

create or replace function public.snapshot_journal_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.journal_entry_history
    (designer_id, entry_id, operation, table_name, prior_state, new_state, changed_by_user_id)
  values (
    coalesce(new.designer_id, old.designer_id),
    coalesce(new.id, old.id),
    tg_op,
    'journal_entries',
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    case when tg_op = 'DELETE' then old.last_modified_by_user_id
         else new.last_modified_by_user_id end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- journal_lines history rows inherit the actor from their parent JE. We
-- don't re-attribute line-only edits; in practice we always rewrite the
-- entire line set when a JE changes.
create or replace function public.snapshot_journal_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_entry_id uuid;
begin
  v_entry_id := coalesce(new.entry_id, old.entry_id);
  select last_modified_by_user_id into v_actor
    from public.journal_entries where id = v_entry_id;
  insert into public.journal_entry_history
    (designer_id, entry_id, operation, table_name, prior_state, new_state, changed_by_user_id)
  values (
    coalesce(new.designer_id, old.designer_id),
    v_entry_id,
    tg_op,
    'journal_lines',
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    v_actor
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
