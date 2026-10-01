import { readFile } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"
import { beforeAll, afterAll, expect, it } from "vitest"
let db: PGlite
const alice = "11111111-1111-4111-8111-111111111111"
const bob = "22222222-2222-4222-8222-222222222222"
beforeAll(async () => {
 db = new PGlite()
 await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); insert into auth.users values('${alice}'),('${bob}'); create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated;`)
 await db.exec(await readFile(new URL("../../../supabase/migrations/20261001140000_managed_mcp_order_drafts.sql",import.meta.url),"utf8"))
},30000)
afterAll(async () => { await db?.close() })
it("persists a draft with owner RLS and hides it from another account", async () => {
 await db.exec(`set role authenticated; set request.jwt.claim.sub='${alice}'; insert into managed_order_drafts(user_id,service_type,package_key,brief) values('${alice}','ugc','starter','{"brandName":"Alice shoes"}');`)
 expect((await db.query("select brief from managed_order_drafts")).rows).toHaveLength(1)
 await db.exec(`set request.jwt.claim.sub='${bob}'`)
 expect((await db.query("select brief from managed_order_drafts")).rows).toHaveLength(0)
 await expect(db.exec(`insert into managed_order_drafts(user_id,service_type,brief) values('${alice}','ugc','{}')`)).rejects.toThrow(/row-level security/)
 await db.exec('reset role')
})
it("denies anonymous access", async () => {
 await db.exec('set role anon')
 await expect(db.query('select * from managed_order_drafts')).rejects.toThrow(/permission denied/)
 await db.exec('reset role')
})
