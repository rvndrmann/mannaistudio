import { readFile } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
const admin = "11111111-1111-4111-8111-111111111111"
const client = "22222222-2222-4222-8222-222222222222"
const order = "33333333-3333-4333-8333-333333333333"
const video = "44444444-4444-4444-8444-444444444444"
let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated;
    create table profiles(id uuid primary key);
    insert into profiles values('${admin}'),('${client}');
    create table admin_users(id uuid references profiles(id)); insert into admin_users values('${admin}');
    create function is_site_admin() returns boolean language sql security definer set search_path=public as $$select exists(select 1 from admin_users where id=auth.uid())$$;
    create table managed_projects(id uuid primary key,user_id uuid,status text,payment_status text,video_count integer,admin_note text);
    insert into managed_projects values('${order}','${client}','brief_received','paid',1,'SECRET INTERNAL NOTE');
    create table managed_messages(id uuid default gen_random_uuid(),project_id uuid,sender_id uuid references profiles(id),sender_is_admin boolean,kind text,body text);
    create table managed_deliverables(id uuid primary key,project_id uuid,status text);
    create table managed_deliverable_versions(id uuid default gen_random_uuid(),project_id uuid,deliverable_id uuid,is_final boolean,storage_path text);
  `)
  await db.exec(await readFile(new URL("../../../supabase/migrations/20261001130000_managed_delivery_plan.sql", import.meta.url), "utf8"))
}, 30_000)
afterAll(async () => { await db?.close() })
describe("managed delivery planning on PostgreSQL", () => {
  it("does not let the customer publish a team plan", async () => {
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${client}'`)
    try { await expect(db.query("select admin_managed_set_delivery_plan($1,null,'Fake date',array['fake'])", [order])).rejects.toThrow("Admins only") }
    finally { await db.exec("reset role") }
  })
  it("updates the public plan and publishes one chat update, with no internal note", async () => {
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`)
    try {
      await db.query("select admin_managed_set_delivery_plan($1,'2026-10-03T12:00:00Z','Sound mixing',array['Client review','Exports'])", [order])
      await db.query("select admin_managed_set_delivery_plan($1,'2026-10-03T12:00:00Z','Sound mixing',array['Client review','Exports'])", [order])
    } finally { await db.exec("reset role") }
    const { rows } = await db.query<{ body: string }>("select body from managed_messages")
    expect(rows).toHaveLength(1)
    expect(rows[0].body).toContain("Sound mixing")
    expect(rows[0].body).toContain("03 Oct 2026 17:30 IST")
    expect(rows[0].body).toContain("Client review")
    expect(rows[0].body).not.toContain("SECRET")
  })
  it("posts stage changes into customer chat", async () => {
    await db.exec(`update managed_projects set status='production' where id='${order}'`)
    const { rows } = await db.query<{ body: string }>("select body from managed_messages where body like 'Project status:%'")
    expect(rows[0].body).toBe("Project status: Production")
  })
  it("blocks false completion until every purchased final file is approved", async () => {
    await expect(db.exec(`update managed_projects set status='completed' where id='${order}'`)).rejects.toThrow("Approve and publish")
    await db.exec(`insert into managed_deliverables values('${video}','${order}','ready_for_review')`)
    await expect(db.exec(`update managed_projects set status='completed' where id='${order}'`)).rejects.toThrow("Approve and publish")
    await db.exec(`update managed_deliverables set status='approved'; insert into managed_deliverable_versions(project_id,deliverable_id,is_final,storage_path) values('${order}','${video}',true,'managed/${order}/deliverables/final.mp4')`)
    await db.exec(`update managed_projects set status='completed' where id='${order}'`)
    expect((await db.query<{ status: string }>("select status from managed_projects")).rows[0].status).toBe("completed")
  })
})
