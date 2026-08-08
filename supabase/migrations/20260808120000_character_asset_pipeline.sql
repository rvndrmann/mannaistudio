-- Character asset pipeline migration: add classification, BytePlus asset tracking & trusted provider metadata
alter table public.creator_entities
  add column if not exists character_type text default 'ai_human',
  add column if not exists source_type text default 'external_untrusted',
  add column if not exists byteplus_asset_class text default 'untrusted_external',
  add column if not exists byteplus_asset_id text,
  add column if not exists byteplus_asset_uri text,
  add column if not exists verification_status text default 'unverified',
  add column if not exists provenance jsonb default '{}'::jsonb;

alter table public.creator_shots
  add column if not exists is_trusted_provider_asset boolean default false,
  add column if not exists provider_asset_uri text;

-- Add check constraint for character_type if not already existing
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'creator_entities_character_type_check'
  ) then
    alter table public.creator_entities
      add constraint creator_entities_character_type_check
      check (character_type in ('ai_human', 'real_person', 'non_human', 'prop'));
  end if;
end $$;

-- Add check constraint for verification_status if not already existing
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'creator_entities_verification_status_check'
  ) then
    alter table public.creator_entities
      add constraint creator_entities_verification_status_check
      check (verification_status in ('not_required', 'verification_required', 'verification_pending', 'verified', 'processing', 'active', 'failed', 'unverified'));
  end if;
end $$;

