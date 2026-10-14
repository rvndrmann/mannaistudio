-- "Book a call" on the done-for-you pages (/ when the homepage is `hire`, and
-- /hire-us). The link lives with the other proof-page settings; this redefines
-- the setter so it keeps `book_call_url` instead of dropping it.
--
-- Only an http(s) link is stored: the value is rendered as an <a href>, and
-- anything else (a javascript: URL, a bare domain) is saved as empty.

create or replace function public.admin_set_proof_page_settings(p_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_value jsonb;
  v_price numeric;
  v_call text;
begin
  if not exists (select 1 from public.admin_users where id = auth.uid()) then
    raise exception 'Admin access required';
  end if;

  v_price := case
    when coalesce(p_value->>'annual_price', '') ~ '^\d+(\.\d+)?$' then (p_value->>'annual_price')::numeric
    else null
  end;

  v_call := left(trim(coalesce(p_value->>'book_call_url', '')), 500);
  if v_call !~* '^https?://' then
    v_call := '';
  end if;

  v_value := jsonb_build_object(
    'cost_example', left(trim(coalesce(p_value->>'cost_example', '')), 400),
    'api_guide_url', left(trim(coalesce(p_value->>'api_guide_url', '')), 500),
    'show_community_reason', coalesce((p_value->>'show_community_reason')::boolean, false),
    'show_annual_plan', coalesce((p_value->>'show_annual_plan')::boolean, false),
    'annual_price', v_price,
    'studio_demo_url', left(trim(coalesce(p_value->>'studio_demo_url', '')), 500),
    'studio_demo_poster', left(trim(coalesce(p_value->>'studio_demo_poster', '')), 500),
    'book_call_url', v_call
  );

  insert into public.site_settings (key, value, updated_at)
  values ('proof_page', v_value, now())
  on conflict (key) do update
  set value = excluded.value,
      updated_at = now();

  return v_value;
end;
$$;

revoke execute on function public.admin_set_proof_page_settings(jsonb) from public, anon;
grant execute on function public.admin_set_proof_page_settings(jsonb) to authenticated, service_role;
