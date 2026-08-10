# Teams, Project Sharing, and Enterprise Engagements

How several people come to work on one project, who is allowed to change what, and
how credits move between them.

## Teams

Each account belongs to at most one team, enforced by a unique constraint on
`team_members.profile_id`. Members are added by the email on their profile and
must already be registered, because the roster is keyed on a real `profiles` row.

| Role | Can do |
| :--- | :--- |
| `owner` | Everything, including disbanding the team. Cannot be removed or demoted. |
| `admin` | Add and remove members, change roles, move team credits. |
| `member` | Work on projects shared with them. |
| `viewer` | Read projects shared with them. Cannot write. |

Writes go exclusively through `SECURITY DEFINER` functions that check the
caller's role: `create_team`, `rename_team`, `add_team_member`,
`update_team_member_role`, `remove_team_member`, `disband_team`. The tables carry
no direct insert/update/delete policies, so the browser cannot bypass those
checks.

### Team credits

Credits move in two stages rather than directly between people:

```
personal balance  <--- transfer_team_credits --->  team pool
team pool         <--- allocate_team_credits --->  member's personal balance
```

Every movement has exactly one profile side, so `credit_transactions` records it
against that profile with the team pool as the counterparty. Balances are locked
in a fixed order, overdrawing is refused, and disbanding a team returns any
pooled credits to the owner rather than destroying them.

## Project sharing

Sharing is **per project, not per team**, so an owner can bring someone into one
project and keep everything else private. `share_project_with_member` requires
the target to be on the owner's team.

Only project *content* is shared. Chat sessions, tool executions, generation
jobs, and workflow runs stay scoped to their own user, so each collaborator gets
their own AI Director conversation and job history on a shared project and spends
their own allocated credits.

### How access is enforced

Two SQL predicates decide everything:

- `can_access_creator_project(project_id)` — the owner, or anyone in
  `creator_project_members`.
- `can_edit_creator_project(project_id)` — the same, minus anyone whose team role
  is `viewer`.

Project-scoped tables carry a pair of policies: a `SELECT` policy using the
access predicate, and an `ALL` policy using the edit predicate. Permissive
policies are OR'd, so a viewer passes the read policy and fails the write one
while editors pass both. On `creator_projects` itself, deletes remain owner-only.

Application code deliberately does **not** filter by `user_id`; an owner filter
would hide projects shared with the caller. `requireAuthenticatedProject` looks
the project up by id and lets row level security decide.

Losing team membership ends project access: `remove_team_member` and
`disband_team` revoke the team's shares before dropping the membership row.

## Enterprise engagements

A client who would rather hire the team than generate a video themselves places
an enterprise order, priced per finished minute.

- The rate lives in `site_settings.enterprise_rate` and is edited from
  **Admin → AI Workflows**, along with a switch to pause new orders.
- Each order **stores the rate it was created with**, so changing the price never
  rewrites an existing quote.
- Orders are requests, not charges. At this rate a short film is a five-figure
  engagement, so an order opens a quote confirmed out of band. No payment is
  taken automatically.

Entry points: the enterprise section on `/billing` for a brief with no project,
and a **Hire our team** button in the Studio project header that hands the open
project over with its script, assets, and storyboard intact.

### Accepting an order

Moving an order to `quoted`, `in_production`, or `delivered` grants the acting
admin access to the attached project through the same
`creator_project_members` grant that team sharing uses — there is no second
access path. Cancelling revokes it. The client's project appears in the admin's
Studio labelled **Client work** with the client's name, rather than as an
unexplained extra project.

Order status also drives the badge on the client's project: `requested`,
`active`, `delivered`, or cleared on cancel.

## Change attribution

On an engagement the client and the production team edit the same script and
storyboard, so every change is recorded with who made it and in what capacity.

`creator_audit_events` gains an `actor_role` of `owner`, `enterprise_team`,
`collaborator`, or `system`, resolved by `creator_actor_role`. **Project
activity** in the project menu lists the history and can be filtered to the
client's changes or the team's.

Attribution is written by database triggers on `creator_shots`,
`creator_entities`, and `creator_episodes` rather than by application code, so no
write path can bypass the record — API route, Director tool, or direct table
write alike. Episode rows are only logged when `script_content` actually changes,
to keep the log readable.

> A trigger that references a column guarded by `tg_table_name` must do so inside
> that branch. PL/pgSQL compiles the whole expression, so a reference to
> `new.script_content` in a shared condition is resolved even when the trigger
> fires for a table without that column — which raises inside the trigger and
> aborts the write itself, not just the logging.

## Where things live

| Concern | Location |
| :--- | :--- |
| Team roster and credits UI | [`src/components/credits/TeamTab.tsx`](../src/components/credits/TeamTab.tsx) |
| Credit usage history | [`src/components/credits/CreditUsageTab.tsx`](../src/components/credits/CreditUsageTab.tsx) |
| Team page | [`src/app/studio/team/page.tsx`](../src/app/studio/team/page.tsx) |
| Share dialog | [`src/components/studio/ShareProjectDialog.tsx`](../src/components/studio/ShareProjectDialog.tsx) |
| Project activity | [`src/components/studio/ProjectActivityDialog.tsx`](../src/components/studio/ProjectActivityDialog.tsx) |
| Enterprise order form | [`src/components/enterprise/EnterpriseOrderForm.tsx`](../src/components/enterprise/EnterpriseOrderForm.tsx) |
| Enterprise admin | [`src/components/enterprise/AdminEnterpriseOrders.tsx`](../src/components/enterprise/AdminEnterpriseOrders.tsx) |
| Access helper | [`src/lib/studio/server-context.ts`](../src/lib/studio/server-context.ts) |
