import { readFile } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

const admin = "11111111-1111-4111-8111-111111111111"
const stranger = "22222222-2222-4222-8222-222222222222"
const pro = "33333333-3333-4333-8333-333333333333"
const legacy = "44444444-4444-4444-8444-444444444444"
const trial = "55555555-5555-4555-8555-555555555555"
const tester = "66666666-6666-4666-8666-666666666666"

let db: PGlite

async function as<T>(role: "service_role" | "authenticated" | "anon", sub: string | null, run: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${role}; set request.jwt.claim.role='${role}'; set request.jwt.claim.sub='${sub ?? ""}'`)
  try { return await run() } finally { await db.exec("reset role; reset request.jwt.claim.role; reset request.jwt.claim.sub") }
}

type Access = { entitled: boolean; purchase_window_expires_at: string | null; purchase_only: boolean }

async function accessOf(profileId: string): Promise<Access> {
  return as("authenticated", profileId, async () => {
    const { rows } = await db.query<{ access: Access }>("select my_creator_studio_access() as access")
    return rows[0].access
  })
}

function grant(profileId: string, source: string, expires: string | null, starts = "now() - interval '1 day'") {
  return db.query(
    `insert into user_entitlements(profile_id, entitlement_key, source_type, source_id, starts_at, expires_at)
     values($1, 'creator_studio_access', $2, gen_random_uuid()::text, ${starts}, ${expires ?? "null"})`,
    [profileId, source],
  )
}

function createProject(owner: string, role: "authenticated" | "service_role" = "authenticated") {
  return as(role, role === "authenticated" ? owner : null, () =>
    db.query("insert into creator_projects(user_id, name) values($1, 'Test') returning id", [owner]))
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
    grant usage on schema auth to anon, authenticated, service_role;
    create table profiles(id uuid primary key);
    insert into profiles values('${admin}'),('${stranger}'),('${pro}'),('${legacy}'),('${trial}'),('${tester}');
    create table admin_users(id uuid references profiles(id)); insert into admin_users values('${admin}');
    create table site_settings(key text primary key, value jsonb);
    create table user_entitlements(
      id uuid primary key default gen_random_uuid(), profile_id uuid not null references profiles(id),
      entitlement_key text not null, source_type text not null default 'admin', source_id text,
      starts_at timestamptz not null default now(), expires_at timestamptz
    );
    create table creator_projects(id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id), name text not null);
    alter table creator_projects enable row level security;
    create policy "creator projects insert" on creator_projects for insert with check (auth.uid() = user_id);
    create policy "creator projects read" on creator_projects for select using (auth.uid() = user_id);
    create policy "creator projects update" on creator_projects for update using (true) with check (true);
    grant select, insert, update on creator_projects to authenticated, service_role;
    alter table creator_projects force row level security;
    create policy "service" on creator_projects for all to service_role using (true) with check (true);
  `)
  await db.exec(await readFile(new URL("../../../supabase/migrations/20261023150000_creator_studio_access_gate.sql", import.meta.url), "utf8"))
}, 30_000)

afterAll(async () => { await db?.close() })

beforeEach(async () => {
  await db.exec("delete from creator_projects; delete from user_entitlements; delete from site_settings;")
})

describe("who the Creator Studio is open to", () => {
  it("keeps admins in without any grant", async () => {
    expect((await accessOf(admin)).entitled).toBe(true)
    await expect(createProject(admin)).resolves.toBeTruthy()
  })

  it("turns away a signed-in account with no subscription", async () => {
    expect(await accessOf(stranger)).toEqual({ entitled: false, purchase_window_expires_at: null, purchase_only: false })
  })

  it("does not count the grant every pre-Academy account was handed", async () => {
    await grant(legacy, "legacy_access", null)
    expect((await accessOf(legacy)).entitled).toBe(false)
  })

  it("opens for an AI Director Hub Pro subscriber while the paid period runs", async () => {
    await grant(pro, "all_access_subscription", "now() + interval '20 days'")
    expect(await accessOf(pro)).toEqual({ entitled: true, purchase_window_expires_at: null, purchase_only: false })
  })

  it("closes again when the paid period ends", async () => {
    await grant(pro, "all_access_subscription", "now() - interval '1 minute'")
    expect((await accessOf(pro)).entitled).toBe(false)
  })

  it("keeps existing Studio subscribers and paid course grants", async () => {
    await grant(pro, "studio_subscription", null)
    expect((await accessOf(pro)).entitled).toBe(true)
    await grant(legacy, "course_purchase", "now() + interval '30 days'")
    expect((await accessOf(legacy)).entitled).toBe(true)
  })

  it("does not count a free product or a credit purchase as a subscription", async () => {
    await grant(stranger, "free_product", null)
    await grant(stranger, "credit_purchase", null)
    expect((await accessOf(stranger)).entitled).toBe(false)
  })

  it("reports a timed admin grant as a trial window", async () => {
    await grant(trial, "admin_preview", "now() + interval '1 day'")
    const access = await accessOf(trial)
    expect(access.entitled).toBe(true)
    expect(access.purchase_only).toBe(true)
    expect(access.purchase_window_expires_at).not.toBeNull()
  })

  it("honours an indefinite admin grant and the BYOK test list", async () => {
    await grant(trial, "admin", null)
    expect(await accessOf(trial)).toEqual({ entitled: true, purchase_window_expires_at: null, purchase_only: false })
    await db.query("insert into site_settings values('byok_test_access', $1)", [JSON.stringify({ userIds: [tester] })])
    expect((await accessOf(tester)).entitled).toBe(true)
  })

  it("ignores a grant that has not started", async () => {
    await grant(pro, "all_access_subscription", "now() + interval '30 days'", "now() + interval '1 day'")
    expect((await accessOf(pro)).entitled).toBe(false)
  })

  it("does not let a signed-in account ask about someone else", async () => {
    await expect(as("authenticated", stranger, () => db.query("select creator_studio_access($1)", [admin]))).rejects.toThrow(/permission denied/)
  })
})

describe("creating a project", () => {
  it("is refused for an account without access, from the browser and from the service role alike", async () => {
    await expect(createProject(stranger)).rejects.toThrow(/AI Director Hub Pro/)
    await expect(createProject(stranger, "service_role")).rejects.toThrow(/AI Director Hub Pro/)
    await grant(legacy, "legacy_access", null)
    await expect(createProject(legacy)).rejects.toThrow(/AI Director Hub Pro/)
  })

  it("works for a subscriber", async () => {
    await grant(pro, "all_access_subscription", "now() + interval '20 days'")
    await expect(createProject(pro)).resolves.toBeTruthy()
    await expect(createProject(pro, "service_role")).resolves.toBeTruthy()
  })

  it("cannot hand a project to an account without access", async () => {
    const { rows } = await createProject(admin)
    const id = (rows[0] as { id: string }).id
    await expect(as("service_role", null, () => db.query("update creator_projects set user_id=$1 where id=$2", [stranger, id]))).rejects.toThrow(/AI Director Hub Pro/)
    await expect(as("service_role", null, () => db.query("update creator_projects set name='Renamed' where id=$1", [id]))).resolves.toBeTruthy()
  })
})
