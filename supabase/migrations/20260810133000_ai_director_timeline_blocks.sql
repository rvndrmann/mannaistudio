-- Structured, versioned chat timeline blocks for plans, tool activity, media, and next actions.
-- Additive: legacy tool_calls, suggested_actions, media, and thinking fields remain supported.
alter table public.creator_chat_messages
  add column if not exists timeline_version integer not null default 1,
  add column if not exists timeline_blocks jsonb not null default '[]'::jsonb;

alter table public.creator_chat_messages
  drop constraint if exists creator_chat_messages_timeline_blocks_array;

alter table public.creator_chat_messages
  add constraint creator_chat_messages_timeline_blocks_array
  check (jsonb_typeof(timeline_blocks) = 'array');
