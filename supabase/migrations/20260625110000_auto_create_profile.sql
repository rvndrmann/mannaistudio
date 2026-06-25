-- Auto-create a profile row whenever a new auth user signs up, so every
-- account reliably appears in the admin Students panel (previously some
-- sign-ups had no profile row because the client-side upsert didn't fire).

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', '')
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill any existing auth users missing a profile.
insert into public.profiles (id, email, full_name, avatar_url)
select u.id, u.email,
  coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''),
  coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture', '')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;
