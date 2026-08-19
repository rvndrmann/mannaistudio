-- Bring Your Own Key: the credential vault.
--
-- Customers connect their own model-provider credentials and are billed by the
-- provider directly. The stored secret must survive a database dump: what is
-- kept here is ciphertext plus a data encryption key that is itself wrapped by
-- Google Cloud KMS, so the rows alone decrypt to nothing.
--
-- The vault lives in its own schema, outside the API's exposed search path, so
-- it cannot be reached by PostgREST at all — the anon and authenticated roles
-- are never granted usage on it. Only trusted server code holding the service
-- role touches these rows. RLS is enabled underneath that as defence in depth
-- rather than as the control doing the work.

create schema if not exists byok;

-- PostgREST exposes only the schemas it is configured for, and this is not one
-- of them. Revoking anyway so a future config change cannot silently open it.
revoke all on schema byok from anon, authenticated;

create table if not exists byok.provider_credentials (
  id uuid primary key default gen_random_uuid(),

  -- Ownership is per user today. A credential belongs to a team the moment
  -- team_id is set, and the lookup already reads both — so sharing a key across
  -- an agency's seats later is a backfill, not a migration of encrypted rows.
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,

  provider text not null,

  -- The credential itself. BytePlus needs three parts — the ARK API key for
  -- generation, plus an access/secret pair and an asset group for the Asset
  -- Library, which is what clears Seedance's real-person check — so the
  -- plaintext is a JSON object before encryption rather than a bare string.
  -- One provider, one row, however many parts that provider's auth has.
  encrypted_secret bytea not null,
  encrypted_dek bytea not null,
  nonce bytea not null,
  auth_tag bytea not null,

  -- Which scheme wrote this row, so a re-wrap can find the rows that predate a
  -- key rotation without decrypting everything to find out.
  encryption_version integer not null default 1,
  kms_key_version text,

  -- Shown in the UI. Never enough to reconstruct anything.
  key_last4 text,
  key_label text,

  status text not null default 'active',
  last_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz,

  constraint provider_credentials_status_check
    check (status in ('active', 'invalid', 'revoked'))
);

-- One credential per provider per owner. Replacing a key updates this row
-- rather than accumulating copies of a secret.
create unique index if not exists provider_credentials_owner_provider_idx
  on byok.provider_credentials (owner_user_id, provider)
  where team_id is null;

create unique index if not exists provider_credentials_team_provider_idx
  on byok.provider_credentials (team_id, provider)
  where team_id is not null;

alter table byok.provider_credentials enable row level security;

-- No policies are created deliberately: with RLS on and no policy, every role
-- except the service role reads nothing. The absence is the control.

-- Audit trail. Secret-free by construction — there is no column that could
-- hold one.
create table if not exists byok.credential_events (
  id uuid primary key default gen_random_uuid(),
  credential_id uuid references byok.provider_credentials(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  provider text,
  event text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint credential_events_event_check check (event in (
    'credential_connected',
    'credential_replaced',
    'credential_test_succeeded',
    'credential_test_failed',
    'credential_used',
    'credential_deleted',
    'authorization_denied',
    'suspicious_credential_activity'
  ))
);

create index if not exists credential_events_actor_idx on byok.credential_events (actor_user_id, created_at desc);

alter table byok.credential_events enable row level security;

create or replace function byok.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists provider_credentials_updated on byok.provider_credentials;
create trigger provider_credentials_updated
  before update on byok.provider_credentials
  for each row execute function byok.touch_updated_at();

-- The BytePlus asset registry becomes per-account.
--
-- source_path was globally unique because every asset lived on the one
-- platform BytePlus account. Under BYOK an asset id exists only on the account
-- that registered it, so reusing a row across owners would hand one customer an
-- id that resolves to nothing — or to someone else's picture. The identity of a
-- registration is therefore the path *and* the credential it was made under,
-- with null meaning the platform's own account.
alter table public.creator_byteplus_assets
  add column if not exists credential_id uuid references byok.provider_credentials(id) on delete cascade;

alter table public.creator_byteplus_assets
  drop constraint if exists creator_byteplus_assets_source_path_key;

drop index if exists creator_byteplus_assets_source_path_key;

create unique index if not exists creator_byteplus_assets_source_credential_idx
  on public.creator_byteplus_assets (source_path, coalesce(credential_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Which account paid for a generation.
--
-- Recorded on the job rather than inferred afterwards. A BYOK job charges no
-- credits, so credits_used is 0 — and the failure path used to read
-- `credits_used || estimated_credits`, which falls through to the estimate and
-- refunds credits that were never taken. The mode is what the refund reads now.
alter table public.creator_generation_jobs
  add column if not exists billing_mode text not null default 'credits';

alter table public.creator_generation_jobs
  drop constraint if exists creator_generation_jobs_billing_mode_check;

alter table public.creator_generation_jobs
  add constraint creator_generation_jobs_billing_mode_check
  check (billing_mode in ('credits', 'byok'));
