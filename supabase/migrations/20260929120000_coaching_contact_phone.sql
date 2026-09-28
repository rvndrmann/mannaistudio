alter table public.profiles
  add column if not exists contact_phone text;

comment on column public.profiles.contact_phone is 'Optional phone number for scheduling one-on-one coaching.';
