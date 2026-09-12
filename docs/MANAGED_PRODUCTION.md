# Managed Production — Hire Our Creative Team

How a client hires the team instead of operating the studio, and where the line
between their project and ours actually sits.

## The shape of it

```
/hire-us  ──►  /hire-us/brief  ──►  Razorpay  ──►  managed_projects
                                                        │
                         admin: Create in Creator Studio │
                                                        ▼
                                              creator_projects (owned by the admin)
                                                        │
                                          admin: Send to Client │  copies the bytes
                                                        ▼
                                        managed_deliverable_versions
                                                        │
                                       client: approve / request revision
```

The client never opens `/studio`. The producing admin does, on a project they
own, and the only thing that crosses back is a version they deliberately
published.

## Why this is not `enterprise_orders`

`enterprise_orders` is the opposite shape: a client who already has a
`creator_project` of their own hands it over, and accepting the order grants the
admin membership on *their* project. Managed production starts from a brief with
no project at all, and the production is ours. Folding the two together would
mean one status vocabulary describing two different jobs.

## Tables

| Table | Holds |
| :--- | :--- |
| `managed_projects` | the order: service, package, brief (jsonb), status, price, payment, and the two links — `brand_id` and `studio_project_id` |
| `managed_deliverables` | one ad per row (`Ad 01`, `Ad 02`), with its own status |
| `managed_deliverable_versions` | V1, V2, FINAL. Nothing is ever overwritten |
| `managed_messages` | the project conversation, `kind` of `chat` or `delivery` |
| `managed_revision_comments` | timestamped feedback, pinned to the version it was left on |

`notifications` gains `managed_project_id`; the bell routes anything carrying one
to `/hire-us/projects/{id}`.

The brief is kept whole as jsonb rather than shredded into columns. The questions
differ per service and will keep changing, and a producer reads a brief as a
document, not field by field.

## Who may do what

Reads are policy-driven: `managed projects read` is the owner or an admin, and
every child table defers to `can_access_managed_project(project_id)` — a
`SECURITY DEFINER` predicate, so a policy on deliverables can consult the parent
without recursing through its RLS.

Every write that carries value goes through a function, not a policy:

| Function | Caller | Notes |
| :--- | :--- | :--- |
| `create_managed_project` | **service role only** | takes the owner and the price as arguments, because the route that priced the order is the one calling |
| `mark_managed_project_paid` | **service role only** | idempotent; creates the empty deliverable rows |
| `managed_approve_deliverable` | the owner | an admin approving their own work is not an approval |
| `managed_request_revision` | the owner | notes and timestamped comments in one statement |
| `admin_managed_set_status` | admins | notifies the client only at the four stages worth hearing about |
| `admin_managed_publish_version` | admins | refuses a path outside `managed/{project_id}/` |
| `admin_managed_link_studio_project` | admins | the bridge |
| `admin_managed_overview` | admins | the queue |

The two service-role functions carry an `auth.role()` check in the body as well
as the revoked grant — the same two-layer rule
`20260821120000_lock_down_value_granting_rpcs.sql` established for the credit
ledger. Messages and revision comments are the exception to all of this: a
participant genuinely authors those, so they have ordinary insert policies. The
`kind` column is pinned to `chat` in the policy, because `delivery` is the
publish step's own voice.

## Internal versus client files

One bucket, two prefixes:

```
{owner_id}/{studio_project_id}/…     internal — prompts, takes, keyframes, shots
managed/{project_id}/uploads/…       the client's brief assets and chat files
managed/{project_id}/deliverables/…  versions published to the client
```

The client's storage policy matches `managed/{project_id}/` and nothing else, so
an unpublished take has no path they could be handed even if one leaked into a
response. **Publishing copies the bytes** across the line rather than moving the
line — `admin_managed_publish_version` refuses a `storage_path` that is not
already under the client prefix, which is the backstop for the route forgetting
to copy.

Brief assets are uploaded before the project exists, so they land under the
client's own folder and the checkout route adopts them into
`managed/{id}/uploads/` once it has an id.

## The Creator Studio bridge

`openStudioProjectForManaged` ([src/lib/managed/studio-bridge.ts](../src/lib/managed/studio-bridge.ts))
inserts an ordinary `creator_projects` row **owned by the admin**, so the
Director, the script agents, the storyboard, generation and the timeline all work
on it with no special case. What it adds is that the production opens already
knowing the job:

- the brief mapped onto `creative_brief` — the same shape
  `creativeBriefFromBrand` writes, which the Director reads on every turn;
- the client's brand voice, do/don't rules and forbidden claims folded in;
- the brand's asset library and the client's uploaded product art imported as
  `creator_entities`, so the first generation has something to lock onto.

The brand is read with the **service client**, not linked by `brand_id`:
`can_access_creator_brand` grants access to a brand's owner and to members of a
project produced for it, and the producing admin is neither. Copying the facts in
keeps the internal project self-contained rather than leaving a brand link its
owner cannot follow.

The client is deliberately **not** added to `creator_project_members`. Sharing
would put the internal project in their Studio — the one thing a managed service
exists to spare them — and expose every unused take.

## Money

Razorpay, following the season pass exactly: the browser never sends a price.
`/api/managed/checkout` looks the package up in `MANAGED_SERVICES`, prices it,
creates the project unpaid, and puts the project id in the order's `notes`.
`/api/managed/checkout/verify` checks the HMAC, then reads *everything* that
decides entitlement back from Razorpay — whose order, which project, what
amount — and never from the request body.

Micro-drama has no package. It opens the same project with
`proposal_requested`, skips the gateway, and is quoted in the project chat:
pricing a serialised show before agreeing its length would be a number we could
not stand behind.

## Where things live

| Concern | Location |
| :--- | :--- |
| Catalogue, pricing, pipeline vocabulary | [`src/lib/managed-production.ts`](../src/lib/managed-production.ts) |
| Brief schema and the mapping into `creative_brief` | [`src/lib/managed-brief.ts`](../src/lib/managed-brief.ts) |
| Access helper | [`src/lib/managed/server.ts`](../src/lib/managed/server.ts) |
| Studio bridge | [`src/lib/managed/studio-bridge.ts`](../src/lib/managed/studio-bridge.ts) |
| Client uploads | [`src/lib/managed/uploads.ts`](../src/lib/managed/uploads.ts) |
| Marketing page | [`src/app/hire-us/page.tsx`](../src/app/hire-us/page.tsx) |
| Brief flow | [`src/components/managed/BriefFlow.tsx`](../src/components/managed/BriefFlow.tsx) |
| Client project view | [`src/app/hire-us/projects/[projectId]/page.tsx`](../src/app/hire-us/projects/%5BprojectId%5D/page.tsx) |
| Review player and revisions | [`src/components/managed/ReviewSheet.tsx`](../src/components/managed/ReviewSheet.tsx) |
| Admin queue and Send to Client | [`src/components/admin/ManagedProduction.tsx`](../src/components/admin/ManagedProduction.tsx) |
| Migration | [`supabase/migrations/20260913120000_managed_production.sql`](../supabase/migrations/20260913120000_managed_production.sql) |

## Routes

| Route | Who |
| :--- | :--- |
| `/hire-us` | public |
| `/hire-us/brief?service=…&repeat=…` | public; sign-in is asked for at checkout |
| `/hire-us/projects` | signed in |
| `/hire-us/projects/[projectId]` | the owner, or an admin |
| `/api/managed/checkout`, `…/verify`, `/api/managed/prefill` | signed in |
| `/api/managed/projects`, `…/[id]`, `…/messages`, `…/deliverables/[id]` | signed in, RLS decides |
| `/api/admin/managed`, `…/[id]`, `…/publish`, `…/studio-exports` | admins |
| Admin → Managed Production (`/admin?tab=managed`) | admins |

`/hire-us` is deliberately **not** in `adminOnlyPaths`. The studio and the rest
of the SaaS-era surfaces are operator tooling; this is the second thing the site
sells, and it is sold to strangers.

## Pausing it

`site_features.hireUs`, from **Admin → Pause Features**. Off hides the nav entry
*and* closes `/api/managed/checkout` — a hidden nav entry alone would still let a
bookmarked brief take somebody's money. Projects already running stay reachable
and stay deliverable.

## Built to grow into

Nothing here forecloses the next things:

- **Subscriptions** — `managed_projects` already carries its own price and
  package; a monthly plan is a row that opens projects on a schedule rather than
  a new project model.
- **Extra aspect ratios per ad** — `managed_deliverables.aspect_ratio` is per
  deliverable, and the delivery area already groups by it.
- **Competitor research and winning-ad remixing** — the brief's
  `referenceLinks` and reference attachments are already the input for it, and
  they already reach the Studio production as entities.
