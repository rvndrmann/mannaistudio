import { readFile } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

const admin = "11111111-1111-4111-8111-111111111111"
const alice = "22222222-2222-4222-8222-222222222222"
const bob = "33333333-3333-4333-8333-333333333333"
const carol = "44444444-4444-4444-8444-444444444444"
const dave = "55555555-5555-4555-8555-555555555555"

let db: PGlite

async function as<T>(role: "service_role" | "authenticated" | "anon", sub: string | null, run: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${role}; set request.jwt.claim.role='${role}'; set request.jwt.claim.sub='${sub ?? ""}'`)
  try { return await run() } finally { await db.exec("reset role; reset request.jwt.claim.role; reset request.jwt.claim.sub") }
}

/** Opens an order the way the checkout route does. */
function open(buyer: string, packageKey: string, allowQueue = false) {
  return as("service_role", null, async () => {
    const { rows } = await db.query<{ id: string; queue_state: string }>(
      `select id, queue_state from create_managed_project($1,'Campaign','ugc',$2,'{}'::jsonb,1,30,'9:16',2,1000,'pending',null,$3)`,
      [buyer, packageKey, allowQueue],
    )
    return rows[0]
  })
}

function pay(projectId: string) {
  return as("service_role", null, () => db.query(`select * from mark_managed_project_paid($1, $2, 1000)`, [projectId, `pay_${projectId}`]))
}

async function stateOf(projectId: string) {
  const { rows } = await db.query<{ queue_state: string; payment_status: string }>(
    "select queue_state, payment_status from managed_projects where id = $1", [projectId])
  return rows[0]
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
    grant usage on schema auth to anon, authenticated, service_role;
    create table profiles(id uuid primary key, full_name text, email text);
    insert into profiles(id) values('${admin}'),('${alice}'),('${bob}'),('${carol}'),('${dave}');
    create table admin_users(id uuid references profiles(id)); insert into admin_users values('${admin}');
    create function is_site_admin() returns boolean language sql security definer set search_path=public as $$select exists(select 1 from admin_users where id=auth.uid())$$;
    create table managed_offer_packages(id uuid primary key default gen_random_uuid(), key text unique not null);
    insert into managed_offer_packages(key) values('limited'),('open'),('no_queue');
    create table managed_projects(
      id uuid primary key default gen_random_uuid(), user_id uuid references profiles(id), name text,
      service_type text, package_key text not null default '', brief jsonb, status text not null default 'brief_received',
      video_count integer, duration_seconds integer, aspect_ratio text, revisions_included integer,
      price_inr integer, payment_status text not null default 'pending', payment_id text not null default '',
      paid_at timestamptz, brand_id uuid, studio_project_id uuid, admin_last_read_at timestamptz,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );
    create function can_access_managed_project(p uuid) returns boolean language sql stable security definer set search_path=public as $$
      select exists(select 1 from managed_projects where id=p and (user_id=auth.uid() or is_site_admin()))$$;
    create table managed_deliverables(id uuid primary key default gen_random_uuid(), project_id uuid, title text, position integer, aspect_ratio text, status text default 'in_production');
    create table managed_messages(project_id uuid, sender_is_admin boolean, created_at timestamptz);
    create table notifications(user_id uuid, title text, body text, project_id uuid);
    create function notify_managed(u uuid, t text, title text, body text, p uuid) returns void language sql security definer set search_path=public as $$
      insert into notifications values(u, title, body, p)$$;
    create function notify_managed_admins(t text, title text, body text, p uuid, e uuid) returns void language sql security definer set search_path=public as $$
      insert into notifications select id, title, body, p from admin_users$$;
  `)
  await db.exec(await readFile(new URL("../../../supabase/migrations/20261023120000_managed_package_capacity.sql", import.meta.url), "utf8"))
}, 30_000)

afterAll(async () => { await db?.close() })

beforeEach(async () => {
  await db.exec(`
    delete from managed_deliverables; delete from notifications; delete from managed_projects;
    update managed_offer_packages set slot_limit = null, queue_limit = null;
    update managed_offer_packages set slot_limit = 1, queue_limit = 1 where key = 'limited';
    update managed_offer_packages set slot_limit = 1, queue_limit = 0 where key = 'no_queue';
  `)
})

describe("package capacity on PostgreSQL", () => {
  it("opens orders only from the server", async () => {
    await expect(as("authenticated", alice, () =>
      db.query(`select create_managed_project($1,'x','ugc','open','{}'::jsonb,1,30,'9:16',2,1,'pending',null,true)`, [alice]),
    )).rejects.toThrow()
  })

  it("puts every order of an unlimited package in a slot", async () => {
    for (const buyer of [alice, bob, carol]) expect((await open(buyer, "open")).queue_state).toBe("slot")
  })

  it("holds the last slot during checkout, then asks the next buyer to agree to the queue", async () => {
    expect((await open(alice, "limited")).queue_state).toBe("slot")
    await expect(open(bob, "limited")).rejects.toThrow("managed_slots_full")
    expect((await open(bob, "limited", true)).queue_state).toBe("queued")
  })

  it("never lets a buyer's own abandoned attempt fill the package against them", async () => {
    await open(alice, "limited")
    expect((await open(alice, "limited")).queue_state).toBe("slot")
  })

  it("sells out once slots and queue are both taken, consent or not", async () => {
    await open(alice, "limited")
    await open(bob, "limited", true)
    await expect(open(carol, "limited", true)).rejects.toThrow("managed_sold_out")
    await open(alice, "no_queue")
    await expect(open(bob, "no_queue", true)).rejects.toThrow("managed_sold_out")
  })

  it("releases a hold after thirty minutes", async () => {
    await open(alice, "limited")
    await db.exec("update managed_projects set created_at = now() - interval '31 minutes'")
    expect((await open(bob, "limited")).queue_state).toBe("slot")
  })

  it("frees a slot when the order is delivered or cancelled, not before", async () => {
    const first = await open(alice, "limited")
    await pay(first.id)
    await expect(open(bob, "limited")).rejects.toThrow("managed_slots_full")
    await db.exec(`update managed_projects set status = 'completed' where id = '${first.id}'`)
    expect((await open(bob, "limited")).queue_state).toBe("slot")
  })

  it("settles a queued booking in the queue and tells the client their place", async () => {
    const first = await open(alice, "limited")
    const second = await open(bob, "limited", true)
    await pay(first.id)
    await pay(second.id)
    expect(await stateOf(first.id)).toEqual({ queue_state: "slot", payment_status: "paid" })
    expect(await stateOf(second.id)).toEqual({ queue_state: "queued", payment_status: "paid" })
    const { rows } = await db.query<{ body: string }>("select body from notifications where user_id = $1", [bob])
    expect(rows[0].body).toContain("number 1 in line")
  })

  it("queues a payment whose hold lapsed and whose slot was sold meanwhile", async () => {
    const late = await open(alice, "limited")
    await db.exec("update managed_projects set created_at = now() - interval '45 minutes'")
    const quick = await open(bob, "limited")
    await pay(quick.id)
    await pay(late.id)
    expect((await stateOf(late.id)).queue_state).toBe("queued")
  })

  it("gives a queued booking a slot at payment when one is free and nobody waits ahead", async () => {
    const first = await open(alice, "limited")
    const second = await open(bob, "limited", true)
    await db.exec(`update managed_projects set status = 'cancelled' where id = '${first.id}'`)
    await pay(second.id)
    expect((await stateOf(second.id)).queue_state).toBe("slot")
  })

  it("does not let a new buyer jump the queue when a slot frees up", async () => {
    await db.exec("update managed_offer_packages set queue_limit = null where key = 'limited'")
    const first = await open(alice, "limited")
    await pay(first.id)
    const waiting = await open(bob, "limited", true)
    await pay(waiting.id)
    await db.exec(`update managed_projects set status = 'completed' where id = '${first.id}'`)
    await expect(open(carol, "limited")).rejects.toThrow("managed_slots_full")
  })

  it("lets only an admin promote, and only into a free slot", async () => {
    await db.exec("update managed_offer_packages set queue_limit = null where key = 'limited'")
    const first = await open(alice, "limited")
    await pay(first.id)
    const waiting = await open(bob, "limited", true)
    await pay(waiting.id)

    await expect(as("authenticated", bob, () =>
      db.query("select admin_managed_promote_from_queue($1)", [waiting.id]))).rejects.toThrow("Only admins")
    await expect(as("authenticated", admin, () =>
      db.query("select admin_managed_promote_from_queue($1)", [waiting.id]))).rejects.toThrow("slot(s) for this package are in production")

    await db.exec(`update managed_projects set status = 'completed' where id = '${first.id}'`)
    await as("authenticated", admin, () => db.query("select admin_managed_promote_from_queue($1)", [waiting.id]))
    expect((await stateOf(waiting.id)).queue_state).toBe("slot")
  })

  it("tells a client their own place in the queue and nobody else's", async () => {
    await db.exec("update managed_offer_packages set queue_limit = null where key = 'limited'")
    await pay((await open(alice, "limited")).id)
    const bobs = await open(bob, "limited", true)
    await pay(bobs.id)
    const carols = await open(carol, "limited", true)
    await pay(carols.id)

    const mine = await as("authenticated", carol, () => db.query<{ project_id: string; queue_position: number; queue_length: number }>(
      "select * from managed_queue_positions($1)", [[bobs.id, carols.id]]))
    expect(mine.rows).toEqual([{ project_id: carols.id, queue_position: 2, queue_length: 2 }])
  })

  it("publishes counts to anyone, without the caller's own holds", async () => {
    await open(alice, "limited")
    const read = (sub: string | null) => as(sub ? "authenticated" : "anon", sub, () =>
      db.query<{ package_key: string; slots_taken: number; placement: string }>(
        "select package_key, slots_taken, placement from managed_offer_availability() where package_key = 'limited'"))
    expect((await read(null)).rows[0]).toMatchObject({ slots_taken: 1, placement: "queue" })
    expect((await read(alice)).rows[0]).toMatchObject({ slots_taken: 0, placement: "slot" })
    // Unlimited packages have nothing to report.
    expect((await as("anon", null, () => db.query("select * from managed_offer_availability() where package_key = 'open'"))).rows).toHaveLength(0)
  })

  it("keeps the limits admin-only, and treats null as unlimited", async () => {
    const { rows: [pkg] } = await db.query<{ id: string }>("select id from managed_offer_packages where key = 'limited'")
    await expect(as("authenticated", alice, () =>
      db.query("select admin_set_managed_package_capacity($1, 5, 5)", [pkg.id]))).rejects.toThrow("Only admins")
    await as("authenticated", admin, () => db.query("select admin_set_managed_package_capacity($1, null, null)", [pkg.id]))
    await open(alice, "limited")
    expect((await open(bob, "limited")).queue_state).toBe("slot")
  })
})
