-- Reaching the vault without exposing it.
--
-- The credential tables live in the `byok` schema precisely so PostgREST cannot
-- see them. That works — but supabase-js speaks PostgREST, so the service role
-- could not reach them either: "Only the following schemas are exposed: public,
-- graphql_public".
--
-- The fix is not to expose the schema. It is to reach it through a handful of
-- SECURITY DEFINER functions that live in `public`, each doing exactly one
-- thing, with execute revoked from anon and authenticated and granted only to
-- service_role. So the table stays unreachable, the surface is these functions
-- and nothing else, and a browser holding a user's token cannot call them even
-- by guessing the name.
--
-- The one that returns encrypted material is the reason for the care: it is the
-- only path to ciphertext in the system, and it is callable by exactly one role.

-- Metadata for the UI. No key material of any kind.
create or replace function public.byok_list_credentials(p_user uuid)
returns table (
  provider text,
  key_label text,
  key_last4 text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  last_used_at timestamptz
)
language sql
security definer
set search_path = byok, public
as $$
  select provider, key_label, key_last4, status, created_at, updated_at, last_used_at
  from byok.provider_credentials
  where owner_user_id = p_user
$$;

-- Whether a provider is connected. Separate from the listing so the hot path in
-- the billing decision does not read columns it has no use for.
create or replace function public.byok_has_credential(p_user uuid, p_provider text)
returns boolean
language sql
security definer
set search_path = byok, public
as $$
  select exists (
    select 1 from byok.provider_credentials
    where owner_user_id = p_user and provider = p_provider and status = 'active'
  )
$$;

-- Insert or replace. Returns whether an existing credential was replaced, which
-- is what the audit event and the reply to the user turn on.
create or replace function public.byok_save_credential(
  p_user uuid,
  p_provider text,
  p_encrypted_secret bytea,
  p_encrypted_dek bytea,
  p_nonce bytea,
  p_auth_tag bytea,
  p_encryption_version integer,
  p_kms_key_version text,
  p_key_last4 text,
  p_key_label text
)
returns table (credential_id uuid, replaced boolean)
language plpgsql
security definer
set search_path = byok, public
as $$
declare
  existing_id uuid;
begin
  select id into existing_id
  from byok.provider_credentials
  where owner_user_id = p_user and provider = p_provider and team_id is null;

  if existing_id is not null then
    update byok.provider_credentials set
      encrypted_secret = p_encrypted_secret,
      encrypted_dek = p_encrypted_dek,
      nonce = p_nonce,
      auth_tag = p_auth_tag,
      encryption_version = p_encryption_version,
      kms_key_version = p_kms_key_version,
      key_last4 = p_key_last4,
      key_label = p_key_label,
      status = 'active',
      last_error = null
    where id = existing_id;
    return query select existing_id, true;
  end if;

  insert into byok.provider_credentials (
    owner_user_id, provider, encrypted_secret, encrypted_dek, nonce, auth_tag,
    encryption_version, kms_key_version, key_last4, key_label
  ) values (
    p_user, p_provider, p_encrypted_secret, p_encrypted_dek, p_nonce, p_auth_tag,
    p_encryption_version, p_kms_key_version, p_key_last4, p_key_label
  ) returning id into existing_id;
  return query select existing_id, false;
end;
$$;

-- The only path to encrypted material in the system.
create or replace function public.byok_read_credential(p_user uuid, p_provider text)
returns table (
  id uuid,
  encrypted_secret bytea,
  encrypted_dek bytea,
  nonce bytea,
  auth_tag bytea,
  encryption_version integer
)
language sql
security definer
set search_path = byok, public
as $$
  select id, encrypted_secret, encrypted_dek, nonce, auth_tag, encryption_version
  from byok.provider_credentials
  where owner_user_id = p_user and provider = p_provider and status = 'active'
$$;

create or replace function public.byok_touch_credential(p_credential_id uuid)
returns void
language sql
security definer
set search_path = byok, public
as $$
  update byok.provider_credentials set last_used_at = now() where id = p_credential_id
$$;

create or replace function public.byok_delete_credential(p_user uuid, p_provider text)
returns integer
language plpgsql
security definer
set search_path = byok, public
as $$
declare
  removed integer;
begin
  delete from byok.provider_credentials
  where owner_user_id = p_user and provider = p_provider;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

create or replace function public.byok_record_event(
  p_user uuid,
  p_provider text,
  p_credential_id uuid,
  p_event text,
  p_detail jsonb
)
returns void
language sql
security definer
set search_path = byok, public
as $$
  insert into byok.credential_events (actor_user_id, provider, credential_id, event, detail)
  values (p_user, p_provider, p_credential_id, p_event, coalesce(p_detail, '{}'::jsonb))
$$;

-- Only the service role. A SECURITY DEFINER function in `public` is callable
-- over the API by whoever holds execute, so the grant is the whole control:
-- without these revokes, byok_read_credential would hand ciphertext to any
-- signed-in browser that guessed the function name.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.byok_list_credentials(uuid)',
    'public.byok_has_credential(uuid, text)',
    'public.byok_save_credential(uuid, text, bytea, bytea, bytea, bytea, integer, text, text, text)',
    'public.byok_read_credential(uuid, text)',
    'public.byok_touch_credential(uuid)',
    'public.byok_delete_credential(uuid, text)',
    'public.byok_record_event(uuid, text, uuid, text, jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
