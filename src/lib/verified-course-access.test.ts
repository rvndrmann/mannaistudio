import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
it("paid access requires purchase proof or an unexpired subscription", async () => {
 const db = new PGlite()
 try {
 await db.exec(`create schema auth; create function auth.uid() returns uuid language sql as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;
 create table admin_users(id uuid); create table courses(id text,price text,is_published boolean,is_paused boolean);
 create table enrollments(profile_id uuid,course_id text,status text,payment_id text);
 create table payments(profile_id uuid,payment_id text,status text,amount text);
 create table all_access_subscriptions(profile_id uuid,paid_until timestamptz);
 insert into courses values('paid','99',true,false),('free','Free',true,false);
 insert into enrollments values(auth.uid(),'paid','active',null);`)
 await db.exec(readFileSync("supabase/migrations/20261008220000_verified_course_access.sql","utf8"))
 const allowed=async()=> (await db.query<{allowed:boolean}>("select can_access_course('paid') allowed")).rows[0].allowed
 expect(await allowed()).toBe(false)
 await db.exec("insert into all_access_subscriptions values(auth.uid(),now()+interval '1 hour')")
 expect(await allowed()).toBe(true)
 await db.exec("update all_access_subscriptions set paid_until=now()-interval '1 second'")
 expect(await allowed()).toBe(false)
 await db.exec("update enrollments set payment_id='pay_verified'; insert into payments values(auth.uid(),'pay_verified','success','799')")
 expect(await allowed()).toBe(true)
 expect((await db.query<{allowed:boolean}>("select can_access_course('free') allowed")).rows[0].allowed).toBe(true)
 } finally { await db.close() }
},30000)
