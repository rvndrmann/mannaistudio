-- A refresh used to revoke the connection's previous access token in the same
-- statement that issued the new one. An assistant sends several tool calls at
-- once, so some were always already on their way carrying the old token when
-- another call refreshed it — and those came back "Invalid external access
-- token" for a connection that was perfectly healthy.
--
-- The previous token now keeps working for two more minutes instead. That is
-- long enough for anything in flight to land and short enough that rotation
-- still means something: the old token cannot outlive its own expiry, and
-- disconnecting the assistant still cuts everything off at once, because that
-- is checked on the connection rather than on the token.
create or replace function public.creator_mcp_exchange(
  p_grant text, p_hash text, p_client text, p_resource text,
  p_redirect text, p_challenge text, p_access_hash text, p_access_prefix text,
  p_refresh_hash text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare c creator_mcp_connections%rowtype; a creator_mcp_codes%rowtype;
begin
  if p_grant = 'authorization_code' then
    select * into a from creator_mcp_codes where code_hash = p_hash for update;
    if not found or a.expires_at <= now() or a.redirect_uri <> p_redirect or a.challenge <> p_challenge then
      raise exception 'invalid_grant';
    end if;
    select * into c from creator_mcp_connections where id = a.connection_id for update;
  elsif p_grant = 'refresh_token' then
    select * into c from creator_mcp_connections where refresh_hash = p_hash for update;
    if not found or c.refresh_expires_at is null or c.refresh_expires_at <= now() then raise exception 'invalid_grant'; end if;
  else
    raise exception 'unsupported_grant_type';
  end if;
  if c.id is null or c.revoked_at is not null or c.client_id <> p_client or c.resource <> p_resource then
    raise exception 'invalid_grant';
  end if;
  -- Row locks serialize exchange and refresh; old refresh tokens cannot be replayed.
  if p_grant = 'authorization_code' then delete from creator_mcp_codes where code_hash = p_hash; end if;
  update creator_mcp_connections set refresh_hash = p_refresh_hash,
    refresh_expires_at = now() + interval '30 days' where id = c.id;
  update creator_external_access_tokens
    set expires_at = least(coalesce(expires_at, now() + interval '2 minutes'), now() + interval '2 minutes')
    where mcp_connection_id = c.id and revoked_at is null;
  insert into creator_external_access_tokens(user_id, name, token_hash, token_prefix, scopes, expires_at, resource, mcp_connection_id)
    values(c.user_id, c.name, p_access_hash, p_access_prefix, c.scopes, now() + interval '1 hour', c.resource, c.id);
  return jsonb_build_object('scope', array_to_string(c.scopes, ' '));
end; $$;
revoke all on function public.creator_mcp_exchange(text,text,text,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.creator_mcp_exchange(text,text,text,text,text,text,text,text,text) to service_role;
