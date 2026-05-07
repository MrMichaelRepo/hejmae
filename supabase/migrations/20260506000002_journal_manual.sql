-- RPC for creating a manual journal entry atomically.
--
-- The Supabase JS client doesn't expose explicit transactions, so a multi-
-- statement insert (header + N lines) needs to live in a stored proc to
-- keep the deferred sum-to-zero constraint useful. We also validate that
-- every account in the lines belongs to the same designer in the same
-- call, so the API route doesn't have to round-trip per line.

create or replace function public.create_manual_journal_entry(
  p_designer_id  uuid,
  p_entry_date   date,
  p_memo         text,
  p_lines        jsonb
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

  insert into public.journal_entries (designer_id, entry_date, memo, source_type, source_id)
  values (p_designer_id, p_entry_date, nullif(p_memo, ''), 'manual', null)
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

  -- The deferred sum-to-zero constraint trigger fires at commit; if the
  -- caller submitted an unbalanced entry the whole transaction rolls back
  -- and the API surfaces the error.
  return v_entry_id;
end;
$$;

revoke all on function public.create_manual_journal_entry(uuid, date, text, jsonb) from public;
grant execute on function public.create_manual_journal_entry(uuid, date, text, jsonb)
  to service_role;
