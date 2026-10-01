import { readFile } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const owner = "11111111-1111-4111-8111-111111111111"
const other = "22222222-2222-4222-8222-222222222222"
const connection = "33333333-3333-4333-8333-333333333333"
let db: PGlite
async function exchange(grant: string, hash: string, client = "client-a", resource = "https://studio.example/api/mcp", challenge = "challenge", access = "access-1", refresh = "refresh-1") {
  return db.query("select public.creator_mcp_exchange($1,$2,$3,$4,$5,$6,$7,$8,$9) as result", [grant, hash, client, resource, "https://client.example/callback", challenge, access, "aih_prefix", refresh])
}
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    insert into auth.users values('${owner}'),('${other}');
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    create table creator_projects(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),name text,description text,production_mode text,project_type text);
    create table creator_episodes(id uuid primary key default gen_random_uuid(),project_id uuid references creator_projects(id),name text,description text,status text);
    create table creator_chat_sessions(id uuid primary key default gen_random_uuid(),episode_id uuid references creator_episodes(id),user_id uuid references auth.users(id),title text);
    create table creator_external_access_tokens(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),name text,token_hash text unique,token_prefix text,scopes text[],revoked_at timestamptz);
    alter table creator_projects enable row level security;
    create policy own_projects on creator_projects for all to authenticated using(user_id = auth.uid()) with check(user_id = auth.uid());
    alter table creator_episodes enable row level security;
    create policy own_episodes on creator_episodes for all to authenticated using(exists(select 1 from creator_projects where id=project_id and user_id=auth.uid()));
    alter table creator_chat_sessions enable row level security;
    create policy own_sessions on creator_chat_sessions for all to authenticated using(user_id = auth.uid()) with check(user_id = auth.uid());
    grant select,insert on creator_projects,creator_episodes,creator_chat_sessions to authenticated;
  `)
  await db.exec(await readFile(new URL("../../../../supabase/migrations/20261001120000_creator_studio_mcp_oauth.sql", import.meta.url), "utf8"))
  await db.exec(`
    insert into creator_mcp_clients values('client-a','Assistant A',array['https://client.example/callback'],now()),('client-b','Assistant B',array['https://other.example/callback'],now());
    insert into creator_mcp_connections(id,user_id,client_id,name,scopes,resource) values('${connection}','${owner}','client-a','Assistant A',array['projects:read'],'https://studio.example/api/mcp');
    insert into creator_mcp_codes(code_hash,connection_id,redirect_uri,challenge) values('code-1','${connection}','https://client.example/callback','challenge');
  `)
}, 30_000)
afterAll(async () => { await db?.close() })
describe("MCP migration on PostgreSQL", () => {
  it("rejects wrong client, audience and PKCE without consuming the valid code", async () => {
    await expect(exchange("authorization_code", "code-1", "client-b")).rejects.toThrow("invalid_grant")
    await expect(exchange("authorization_code", "code-1", "client-a", "https://attacker.example/mcp")).rejects.toThrow("invalid_grant")
    await expect(exchange("authorization_code", "code-1", "client-a", undefined, "wrong-verifier")).rejects.toThrow("invalid_grant")
    await expect(db.query("select creator_mcp_exchange('authorization_code','code-1','client-a','https://studio.example/api/mcp','https://attacker.example/callback','challenge','invalid-access','prefix','invalid-refresh')")).rejects.toThrow("invalid_grant")
    await exchange("authorization_code", "code-1")
    const { rows } = await db.query<{ user_id: string; resource: string; expires_at: string }>("select user_id,resource,expires_at from creator_external_access_tokens where token_hash='access-1'")
    expect(rows[0].user_id).toBe(owner)
    expect(rows[0].resource).toBe("https://studio.example/api/mcp")
    expect(rows[0].expires_at).toBeTruthy()
    await expect(exchange("authorization_code", "code-1")).rejects.toThrow("invalid_grant")
  })
  it("atomically rotates refresh tokens and revokes previous access tokens", async () => {
    const outcomes = await Promise.allSettled([
      exchange("refresh_token", "refresh-1", "client-a", undefined, undefined, "access-2", "refresh-2"),
      exchange("refresh_token", "refresh-1", "client-a", undefined, undefined, "access-3", "refresh-3"),
    ])
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1)
    const { rows } = await db.query<{ revoked_at: string }>("select revoked_at from creator_external_access_tokens where token_hash='access-1'")
    expect(rows[0].revoked_at).toBeTruthy()
    const active = await db.query("select id from creator_external_access_tokens where revoked_at is null")
    expect(active.rows).toHaveLength(1)
  })
  it("refuses revoked and expired connections", async () => {
    const { rows } = await db.query<{ refresh_hash: string }>("select refresh_hash from creator_mcp_connections")
    await db.exec(`update creator_mcp_connections set revoked_at=now() where id='${connection}'`)
    await expect(exchange("refresh_token", rows[0].refresh_hash)).rejects.toThrow("invalid_grant")
    await db.exec(`insert into creator_mcp_codes(code_hash,connection_id,redirect_uri,challenge,expires_at) values('expired-code','${connection}','https://client.example/callback','challenge',now()-interval '1 second')`)
    await expect(exchange("authorization_code", "expired-code")).rejects.toThrow("invalid_grant")
    await db.exec(`update creator_mcp_connections set revoked_at=null,refresh_expires_at=now()-interval '1 second' where id='${connection}'`)
    await expect(exchange("refresh_token", rows[0].refresh_hash)).rejects.toThrow("invalid_grant")
  })
  it("does not expose OAuth secrets or exchange RPCs to browser users", async () => {
    await db.exec("set role authenticated")
    try {
      await expect(db.query("select * from creator_mcp_connections")).rejects.toThrow("permission denied")
      await expect(exchange("refresh_token", "anything")).rejects.toThrow("permission denied")
    } finally { await db.exec("reset role") }
  })
  it("creates workspace under auth.uid and RLS hides another owner's projects", async () => {
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${owner}'`)
    try {
      const { rows } = await db.query<{ result: { project: { user_id: string }; episodeId: string; sessionId: string } }>("select creator_mcp_create_project('My ad',null,'legacy','ai_ad') as result")
      expect(rows[0].result.project.user_id).toBe(owner)
      expect(rows[0].result.episodeId).toBeTruthy()
      expect(rows[0].result.sessionId).toBeTruthy()
      await db.exec(`set request.jwt.claim.sub='${other}'`)
      expect((await db.query("select * from creator_projects")).rows).toHaveLength(0)
      expect((await db.query("select * from creator_episodes")).rows).toHaveLength(0)
      expect((await db.query("select * from creator_chat_sessions")).rows).toHaveLength(0)
    } finally { await db.exec("reset role") }
  })
})
