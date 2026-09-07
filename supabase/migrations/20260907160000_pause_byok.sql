-- Pause bring-your-own-keys.
--
-- The offer is being taken off the table for now, so the flag ships already
-- false rather than defaulting on and waiting for someone to remember to switch
-- it off in the dashboard. The admin Pause Features panel turns it back on.
--
-- Nothing about stored credentials changes here. A customer's wrapped provider
-- key stays in the vault exactly as it was, so switching this back on returns
-- people to what they had instead of asking them to paste keys again.

update public.site_settings
   set value = coalesce(value, '{}'::jsonb) || '{"byok": false}'::jsonb
 where key = 'site_features';

insert into public.site_settings (key, value)
select 'site_features', '{"byok": false}'::jsonb
 where not exists (select 1 from public.site_settings where key = 'site_features');
