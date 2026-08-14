# Seedance Asset Library

BytePlus keeps a **private asset library of 50 images for the whole account**. Registering an image there is what clears Seedance's real-person check, so any photograph-like reference — a character sheet, a rendered keyframe — has to be registered before it can be sent.

Fifty is a small number for a studio that generates all day, and the library used to fill within a couple of hours.

## Why it filled

Three paths were spending slots without anybody asking for it:

1. **Every generated image was registered on the way out of the image route**, whatever produced it and whether or not Seedance would ever reference it. A dozen shots at a few attempts each exhausted the library in an afternoon.
2. **The manual video route registered its face references inside the submit**, so rendering the same shot twice created two assets for the same picture — including for requests the provider then rejected.
3. **Nothing recorded what had been registered.** There was no way to tell which slots were spent on what, so nothing could be cleaned up deliberately.

## How it works now

`creator_byteplus_assets` is the registry: one row per registered image, keyed by `source_path` (the studio storage path). A path registers **once** and is reused everywhere after, with `last_used_at` and `use_count` touched on each reuse so an asset nobody needs any more can be recognised as such.

| Concern | Behaviour |
| :--- | :--- |
| When registration happens | When an image is actually used as a Seedance reference — `resolveRegisteredAsset` in `src/lib/studio/byteplus-assets.ts` — plus on demand from the **Add to Asset Library** and **Verify for Seedance** buttons |
| Repeat use | Reuses the stored `asset_uri`; no second registration |
| Assets from before the registry | Adopted on next use via `recordExistingAsset`, so the admin view reports the slots actually spent rather than an almost empty library over a full account |
| Seedream output | Registered as part of generating it, so that slot is already spent; recorded so it can be reclaimed |
| Failures | Registration failures are warnings, never generation failures — the caller falls back to sending the signed URL |

## Admin → Seedance Assets

Shows slots used against the 50, and for each asset: name, BytePlus asset id, use count, and when it was last needed. Anything untouched for seven days or more is flagged **unused 7d+** — those are the delete candidates.

**Deleting frees the slot at BytePlus only.** The image stays in the project: the file in storage, the entity's `reference_images`, the shot's keyframe are all untouched, and it registers itself again the next time a Seedance job needs it.

Deletion does three things in order, and the order matters:

1. `DeleteAsset` at the provider — its copy is what counts against the quota, so removing only our row would free nothing while looking like it had.
2. Clears the asset pointers (`metadata.byteplus_asset_id`, `byteplus_asset_uri`, the entity columns, `is_trusted_provider_asset`) from any entity or shot that carried them. A pointer to an asset the provider no longer has fails the next generation instead of quietly registering again.
3. Removes the registry row.

## Open items

- **`DeleteAsset` is unverified against the live API.** The action is documented, but BytePlus's reference pages render client-side and could not be read, so the request shape follows the `GetAsset`/`CreateAsset` calls that are known to work. The panel surfaces the provider's error verbatim if it is wrong.
- **No list call.** The panel reports the studio's own record, which is what fills the quota. Assets created before the registry existed — or by anything other than this app — are invisible until something uses them. Clear those from the BytePlus console.

## Key implementation files

- `src/lib/studio/byteplus-assets.ts` — the registry: resolve, adopt, list
- `src/lib/studio/byteplus.ts` — `createBytePlusAsset`, `getBytePlusAsset`, `deleteBytePlusAsset`, request signing
- `src/app/api/admin/byteplus-assets/route.ts` — admin list and delete, pointer clearing
- `src/app/admin/page.tsx` — the Seedance Assets panel
- `supabase/migrations/20260814090000_byteplus_asset_registry.sql`
