-- Enrollment/progress alone is not proof of payment for a paid course.
create or replace function public.can_access_course(p_course_id text) returns boolean
language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and (
 exists(select 1 from public.admin_users where id=auth.uid())
 or exists(select 1 from public.courses c where c.id=p_course_id and c.is_published and not coalesce(c.is_paused,false) and (
   coalesce(c.price::text,'') in ('','Free','$0','0','0.00')
   or exists(select 1 from public.enrollments e join public.payments p on p.payment_id=e.payment_id and p.profile_id=e.profile_id
      where e.profile_id=auth.uid() and e.course_id=c.id and e.status='active'
        and lower(p.status) in ('success','paid','captured') and p.amount::numeric>0)
   or exists(select 1 from public.all_access_subscriptions s where s.profile_id=auth.uid() and s.paid_until>now())
  ))
 );
$$;
