import { readFileSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const user = "11111111-1111-4111-8111-111111111111"
let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema storage;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
    create table public.profiles(id uuid primary key, membership_status text, membership_expires_at timestamptz, credits_balance integer default 100);
    create table public.admin_users(id uuid primary key);
    create table public.courses(id text primary key, price text, is_published boolean default true, is_paused boolean default false);
    create table public.lessons(id uuid default gen_random_uuid(),course_id text,video_url text); alter table public.lessons enable row level security;
    create table public.enrollments(profile_id uuid,course_id text,status text,payment_id text default 'free');
    create table public.user_entitlements(profile_id uuid,entitlement_key text,source_type text,source_id text,starts_at timestamptz,expires_at timestamptz,unique(profile_id,entitlement_key,source_type,source_id));
    create table storage.buckets(id text primary key,public boolean); insert into storage.buckets values('videos',true);
    create table storage.objects(bucket_id text,name text); alter table storage.objects enable row level security;
    insert into profiles(id) values('${user}'); insert into courses(id,price) values('paid','99'),('free','Free');
    select set_config('test.user','${user}',false);
  `)
  await db.exec(readFileSync("supabase/migrations/20261007120000_all_access_byok_subscription.sql", "utf8"))
}, 30_000)
afterAll(async () => { await db.close() })

async function charge(payment: string, end: string) {
  await db.query("select apply_all_access_subscription_event($1,$2,'active',false,$3,$4,99900,'INR')", ["sub_test", user, payment, end])
}
describe("All Access subscription database lifecycle", () => {
  it("locks course data and video downloads before payment", async () => {
    expect((await db.query<{ allowed: boolean }>("select can_access_course('paid') allowed")).rows[0].allowed).toBe(false)
    expect((await db.query<{ public: boolean }>("select public from storage.buckets where id='videos'")).rows[0].public).toBe(false)
    expect((await db.query<{ allowed: boolean }>("select can_access_course('free') allowed")).rows[0].allowed).toBe(true)
  })
  it("activation does not grant access or credits", async () => {
    await db.query("insert into all_access_subscriptions(id,profile_id,plan_id) values('sub_test',$1,'plan_test')", [user])
    await db.query("select apply_all_access_subscription_event('sub_test',$1,'active',false)", [user])
    expect((await db.query("select * from user_entitlements")).rows).toHaveLength(0)
  })
  it("a successful charge grants both entitlements and zero credits", async () => {
    await charge("pay_1", "2099-01-01T00:00:00Z")
    expect((await db.query<{ entitlement_key: string }>("select entitlement_key from user_entitlements order by entitlement_key")).rows.map(r => r.entitlement_key)).toEqual(["academy_all_courses", "creator_studio_access"])
    expect((await db.query<{ credits_balance: number }>("select credits_balance from profiles")).rows[0].credits_balance).toBe(100)
    expect((await db.query<{ allowed: boolean }>("select can_access_course('paid') allowed")).rows[0].allowed).toBe(true)
  })
  it("duplicate and older charges cannot duplicate grants or shorten access", async () => {
    await charge("pay_2", "2099-02-01T00:00:00Z")
    await charge("pay_1", "2099-01-01T00:00:00Z")
    await charge("pay_1", "2099-12-01T00:00:00Z") // Reusing a payment cannot grant a different period.
    expect((await db.query("select * from all_access_subscription_payments")).rows).toHaveLength(2)
    expect((await db.query("select * from user_entitlements")).rows).toHaveLength(2)
    expect(String((await db.query<{ paid_until: Date }>("select paid_until from all_access_subscriptions")).rows[0].paid_until)).toContain("2099")
    expect((await db.query<{ allowed: boolean }>("select bool_and(expires_at='2099-02-01T00:00:00Z'::timestamptz) allowed from user_entitlements")).rows[0].allowed).toBe(true)
  })
  it("cancellation preserves paid access and credits cannot be spent", async () => {
    await db.query("select apply_all_access_subscription_event('sub_test',$1,'cancelled',true)", [user])
    expect((await db.query<{ allowed: boolean }>("select can_access_course('paid') allowed")).rows[0].allowed).toBe(true)
    await expect(db.exec("update profiles set credits_balance=99")).rejects.toThrow("own provider API keys")
  })
  it("expiry removes course access while preserving purchases and existing progress", async () => {
    await db.exec("update user_entitlements set expires_at=now()-interval '1 second'")
    expect((await db.query<{ allowed: boolean }>("select can_access_course('paid') allowed")).rows[0].allowed).toBe(false)
    await db.query("insert into enrollments(profile_id,course_id,status) values($1,'paid','active')", [user])
    expect((await db.query<{ allowed: boolean }>("select can_access_course('paid') allowed")).rows[0].allowed).toBe(true)
  })
  it("authenticated clients cannot invoke the payment-grant function", async () => {
    const result = await db.query<{ allowed: boolean }>("select has_function_privilege('authenticated','public.apply_all_access_subscription_event(text,uuid,text,boolean,text,timestamptz,bigint,text)','execute') allowed")
    expect(result.rows[0].allowed).toBe(false)
  })
})
