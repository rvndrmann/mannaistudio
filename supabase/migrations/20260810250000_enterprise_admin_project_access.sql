-- Accepting an enterprise order puts the client's project in the admin's Studio.
--
-- The team cannot produce a video they cannot open. Accepting an order (moving it
-- to quoted, in production, or delivered) grants the acting admin access to the
-- attached project through the same creator_project_members grant used by team
-- sharing, so no separate access path exists. Cancelling revokes it again.

create or replace function public.admin_update_enterprise_order(p_order_id uuid, p_status text, p_admin_note text default null)
returns public.enterprise_orders
language plpgsql security definer set search_path = public as $$
declare
  order_row public.enterprise_orders;
begin
  if not exists (select 1 from public.admin_users where id = auth.uid()) then
    raise exception 'Only admins can update enterprise orders';
  end if;
  if p_status not in ('requested', 'quoted', 'in_production', 'delivered', 'cancelled') then
    raise exception 'Invalid order status';
  end if;

  update public.enterprise_orders
  set status = p_status,
      admin_note = coalesce(p_admin_note, admin_note),
      updated_at = now()
  where id = p_order_id
  returning * into order_row;
  if order_row.id is null then raise exception 'Order not found'; end if;

  if order_row.project_id is not null then
    -- Keep the project badge in step with the engagement.
    update public.creator_projects
    set enterprise_status = case
      when p_status in ('quoted', 'in_production') then 'active'
      when p_status = 'delivered' then 'delivered'
      when p_status = 'cancelled' then null
      else 'requested'
    end
    where id = order_row.project_id;

    if p_status in ('quoted', 'in_production', 'delivered') then
      -- Never grant the owner access to their own project as a "member".
      if order_row.user_id <> auth.uid() then
        insert into public.creator_project_members (project_id, profile_id, added_by)
        values (order_row.project_id, auth.uid(), auth.uid())
        on conflict (project_id, profile_id) do nothing;
      end if;
    elsif p_status = 'cancelled' then
      delete from public.creator_project_members
      where project_id = order_row.project_id
        and profile_id = auth.uid()
        and profile_id <> order_row.user_id;
    end if;
  end if;

  return order_row;
end;
$$;

grant execute on function public.admin_update_enterprise_order(uuid, text, text) to authenticated;

-- Surfaces who a shared project belongs to, so the Studio can label a client
-- engagement rather than showing an unexplained extra project.
create or replace function public.accessible_project_owners()
returns table (project_id uuid, owner_id uuid, owner_name text, owner_email text, enterprise_status text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  return query
    select p.id, p.user_id, prof.full_name, prof.email, p.enterprise_status
    from public.creator_projects p
    join public.profiles prof on prof.id = p.user_id
    where p.user_id = auth.uid()
       or exists (select 1 from public.creator_project_members m where m.project_id = p.id and m.profile_id = auth.uid());
end;
$$;

grant execute on function public.accessible_project_owners() to authenticated;
