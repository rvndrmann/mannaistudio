-- What an agent changed on the brand during a turn.
--
-- The agent records what it learns as the conversation goes, and a chat
-- reopened next week should still show which answers came out of it. Kept
-- beside the message rather than pasted into its text so the reply stays the
-- agent's words.

alter table public.creator_brand_chat_messages
  add column if not exists tool_notes jsonb not null default '[]'::jsonb;
