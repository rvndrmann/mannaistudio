alter table public.courses
    add column if not exists sort_order integer not null default 1000000,
    add column if not exists highlights text[] not null default '{}';

with ordered as (
    select id, row_number() over (order by created_at, id) - 1 as position
    from public.courses
    where sort_order = 1000000
)
update public.courses as c
set sort_order = ordered.position
from ordered
where c.id = ordered.id;

create or replace function public.admin_reorder_courses(p_course_ids text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not exists (select 1 from public.admin_users where id = auth.uid()) then
        raise exception 'Admin access required';
    end if;
    if array_length(p_course_ids, 1) is distinct from (select count(*) from public.courses)
       or (select count(distinct id) from unnest(p_course_ids) as id) is distinct from (select count(*) from public.courses)
       or exists (select 1 from unnest(p_course_ids) as input(id) where not exists (select 1 from public.courses where courses.id = input.id)) then
        raise exception 'Course order must contain every course exactly once';
    end if;
    update public.courses as c
    set sort_order = ordered.position - 1
    from unnest(p_course_ids) with ordinality as ordered(id, position)
    where c.id = ordered.id;
    if not found then
        raise exception 'No courses were reordered';
    end if;
end;
$$;

revoke all on function public.admin_reorder_courses(text[]) from public;
grant execute on function public.admin_reorder_courses(text[]) to authenticated;
