-- Razorpay Subscriptions support.
-- Stores the active subscription id on the profile so webhook events can be
-- reconciled, and provides a helper to set/clear it.

alter table public.profiles
add column if not exists razorpay_subscription_id text;

-- Link (or unlink) a Razorpay subscription to a profile.
create or replace function public.set_razorpay_subscription(
    p_profile_id uuid,
    p_subscription_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.profiles
    set razorpay_subscription_id = nullif(p_subscription_id, '')
    where id = p_profile_id;

    return found;
end;
$$;

grant execute on function public.set_razorpay_subscription(uuid, text) to anon, authenticated;
