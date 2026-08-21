-- Record own-key generations in the credit ledger, at zero credits.
--
-- A generation that runs on the customer's own provider key charges no studio
-- credits, so it wrote no `credit_transactions` row — and the Credit Usage tab
-- reads only that table. The effect was that own-key work left no trace a user
-- could see there. That is a dispute waiting to happen: someone can claim their
-- credits were taken for a generation when they never were, and there is no
-- positive record to answer with.
--
-- So every own-key job now leaves a ledger line of its own: amount 0, with
-- `balance_after` equal to the balance at the time — a timestamped statement,
-- for that model, that the balance did not move. It reads in the same place a
-- real charge would, next to it, which is exactly where a disputed charge would
-- be looked for.
--
-- Done as a trigger on the job tables rather than at each API call site, because
-- there are five charge paths (two quick, two production, the Director tool) and
-- a sixth would forget. Every BYOK job is inserted already set to run — the
-- Director's are inserted `approved` and executed in the background — so an
-- insert with billing_mode = 'byok' always corresponds to a generation that
-- actually happened; there is no un-run proposal to record by mistake.
--
-- The recording is best-effort: any failure inside it is swallowed with a
-- warning, because an audit convenience must never be able to block the
-- generation whose row just triggered it. The authoritative record remains the
-- job itself, which carries billing_mode = 'byok' and credits_used = 0.

create or replace function public.record_byok_generation_usage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_kind text;
  v_provider text;
begin
  if new.billing_mode is distinct from 'byok' then
    return new;
  end if;

  -- One line per job. A job row is inserted once, so this mainly guards against
  -- a replayed or re-applied insert.
  if exists (
    select 1 from public.credit_transactions
    where type = 'byok_generation' and metadata->>'job_id' = new.id::text
  ) then
    return new;
  end if;

  select coalesce(credits_balance, 0) into v_balance from public.profiles where id = new.user_id;
  v_balance := coalesce(v_balance, 0);

  v_kind := coalesce(new.type::text, 'generation');
  v_provider := coalesce(nullif(new.provider, ''), 'your provider');

  begin
    insert into public.credit_transactions (profile_id, amount, balance_after, type, model, description, metadata)
    values (
      new.user_id,
      0,
      v_balance,
      'byok_generation',
      new.model,
      format('%s on your own %s key — no studio credits charged', initcap(v_kind), v_provider),
      jsonb_strip_nulls(jsonb_build_object(
        'job_id', new.id,
        'provider', new.provider,
        'billing_mode', 'byok',
        'kind', v_kind
      ))
    );
  exception when others then
    -- Never let an audit write break the generation that triggered it.
    raise warning 'record_byok_generation_usage failed for job %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

-- Quick Create (standalone image/video).
drop trigger if exists record_byok_usage_on_quick on public.creator_quick_generations;
create trigger record_byok_usage_on_quick
  after insert on public.creator_quick_generations
  for each row execute function public.record_byok_generation_usage();

-- Production and Director generations.
drop trigger if exists record_byok_usage_on_jobs on public.creator_generation_jobs;
create trigger record_byok_usage_on_jobs
  after insert on public.creator_generation_jobs
  for each row execute function public.record_byok_generation_usage();
