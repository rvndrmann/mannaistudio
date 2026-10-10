import { readFileSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

let db: PGlite
const owner = "00000000-0000-0000-0000-000000000001"
const other = "00000000-0000-0000-0000-000000000002"
const id = (n: number) => `10000000-0000-0000-0000-${String(n).padStart(12, "0")}`
beforeEach(async () => {
  db = new PGlite()
  await db.exec(`
    create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select '${owner}'::uuid $$;
    create function auth.role() returns text language sql as $$ select 'authenticated'::text $$;
    create table creator_generation_jobs(id uuid primary key, user_id uuid, type text, provider text,
      billing_mode text, status text, started_at timestamptz, provider_job_id text);
  `)
  await db.exec("create table creator_quick_generations (like creator_generation_jobs including all)")
  await db.exec(readFileSync("supabase/migrations/20261010100000_openai_image_submission_queue.sql", "utf8"))
  await db.exec(readFileSync("supabase/migrations/20261010101000_quick_image_shared_queue.sql", "utf8"))
})
afterEach(async () => { await db.close() })
async function add(n: number, status = "approved", mode = "credits", user = owner, started: string | null = null) {
  await db.query("insert into creator_generation_jobs values($1,$2,'image','openai',$3,$4,$5,null)", [id(n), user, mode, status, started])
}
async function claim(n: number) {
  const r = await db.query<{ claimed: boolean }>("select claim_openai_image_job($1) as claimed", [id(n)])
  return r.rows[0].claimed
}
describe("database image submission queue", () => {
  it("holds the eleventh image until one of ten active jobs finishes", async () => {
    for (let n = 1; n <= 11; n++) await add(n)
    for (let n = 1; n <= 10; n++) expect(await claim(n)).toBe(true)
    expect(await claim(11)).toBe(false)
    await db.query("update creator_generation_jobs set status='completed' where id=$1", [id(1)])
    expect(await claim(11)).toBe(true)
  })
  it("permits only one claim of the same image", async () => {
    await add(1)
    expect(await Promise.all([claim(1), claim(1)])).toEqual([true, false])
  })
  it("paces submissions even when previous images have completed", async () => {
    for (let n = 1; n <= 120; n++) await add(n, "completed", "credits", owner, new Date().toISOString())
    await add(121)
    expect(await claim(121)).toBe(false)
  })
  it("isolates BYOK owners but shares the platform account capacity", async () => {
    for (let n = 1; n <= 10; n++) await add(n, "processing", "byok", other, new Date().toISOString())
    await add(11, "approved", "byok")
    expect(await claim(11)).toBe(true)
    for (let n = 12; n <= 21; n++) await add(n, "processing", "credits", other, new Date().toISOString())
    await add(22)
    expect(await claim(22)).toBe(false)
  })
  it("counts Quick Create and project images in the same account scope", async () => {
    for (let n = 1; n <= 10; n++) await add(n, "processing", "credits", owner, new Date().toISOString())
    await db.query("insert into creator_quick_generations values($1,$2,'image','openai','credits','processing',null,null)", [id(11), owner])
    const r = await db.query<{ claimed: boolean }>("select claim_openai_image_job($1,true) as claimed", [id(11)])
    expect(r.rows[0].claimed).toBe(false)
  })
  it("refuses a caller claiming another user's job", async () => {
    await add(1, "approved", "byok", other)
    await expect(claim(1)).rejects.toThrow("Not authorized")
  })
})
