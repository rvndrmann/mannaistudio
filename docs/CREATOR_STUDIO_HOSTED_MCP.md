# Creator Studio hosted MCP

Customers connect a remote MCP URL, sign in with the website's existing Google
login, and approve permissions for their own account. No customer installs a
local Node server or receives the site's Supabase service-role key.

## Production setup

1. Apply `supabase/migrations/20261001120000_creator_studio_mcp_oauth.sql` using
   your normal migration release process. Do not blindly push unrelated pending
   migrations from this checkout.
2. Set `STUDIO_MCP_PUBLIC_URL=https://YOUR-STUDIO-DOMAIN` in the deployment's
   server environment. It is an origin, with no path or trailing endpoint.
   Existing `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
   server-only `SUPABASE_SERVICE_ROLE_KEY` are also required.
3. Deploy the application. Verify the two public metadata endpoints below and
   that an unauthenticated POST to `/api/mcp` returns 401 and a
   `WWW-Authenticate` header.
   The existing admin-controlled `site_features.mcp` switch must be enabled;
   pausing it denies external account access and new consent approvals.
4. Customers visit `/connect/creator-studio` (also linked as **Connect AI** in
   Studio). They copy `https://YOUR-STUDIO-DOMAIN/api/mcp` into a remote MCP
   client, authenticate, and select **Connect my account** on the website.
   The existing `/studio/external` entry point redirects to this connection page.
5. In Codex, a customer can configure the URL and sign in:

   ```bash
   codex mcp add creator-studio --url https://YOUR-STUDIO-DOMAIN/api/mcp
   codex mcp login creator-studio
   ```

   ChatGPT's custom plugin/MCP connection availability depends on the user's
   client, plan, and workspace settings. Registering a connection does not
   publish a public directory listing; distribution/review is a separate step.

Use `STUDIO_MCP_PUBLIC_URL=http://localhost:3000` only in local development. It
must be HTTPS in production. Configure the trusted reverse proxy to replace
forwarding headers so the per-IP registration limits reflect real client IPs.
Native/server clients can omit `Origin`; supplied origins must match the Studio
origin. Cross-origin browser clients are intentionally not enabled by default.

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `/.well-known/oauth-protected-resource` | Canonical MCP audience and authorization server |
| `/.well-known/oauth-authorization-server` | OAuth discovery, DCR, S256 PKCE, token/revocation URLs |
| `/api/mcp/oauth/register` | Public client registration (HTTPS or loopback callbacks) |
| `/api/mcp/oauth/authorize` | Validate callback, audience, scopes, and PKCE; begin browser consent |
| `/api/mcp/oauth/consent` | Same-origin, cookie-bound, signed-in user decision |
| `/api/mcp/oauth/token` | Atomic one-time code exchange or rotating refresh grant |
| `/api/mcp/oauth/revoke` | Revoke a connection using its access/refresh credential |
| `/api/mcp` | Stateless Streamable HTTP MCP, JSON responses |
| `/api/studio/external/connections` | Signed-in user's list and disconnect controls |

Public clients use `token_endpoint_auth_method=none`; S256 PKCE is mandatory.
Dynamic registration stores exact redirect URIs. Both authorization and token
requests must include `resource=https://YOUR-STUDIO-DOMAIN/api/mcp`. The issuer is
the configured website origin, returned as `iss` in approved/denied callbacks.
Codes expire after two minutes; browser consent transactions after ten minutes;
access tokens after one hour; rotating refresh tokens after thirty days.
Disconnecting invalidates access and refresh credentials on subsequent requests.
A job already running is not cancelled by disconnecting.

## Tools and scopes

| Tool | Scope |
| --- | --- |
| `studio_list_projects` | `projects:read` |
| `studio_create_project` | `projects:write` |
| `studio_storyboard` | `projects:read` |
| `studio_pending_work` | `projects:read` |
| `studio_view_media` | `projects:read` |
| `studio_chat` | `director:chat` |
| `studio_decide_proposal` | `director:proposals` |

Tools absent from the user's consent are not registered. Chat invokes the
existing AI Director and its proposal, provider, billing, and generation
pipeline. It can consume chat credits, as stated on the consent page. Costly
proposal approval uses the existing decision route; clients are instructed to
show the proposal and cost before asking for authorization. Existing project
autopilot settings continue to govern Director behavior.

## Account isolation

- Identity comes from a hashed per-user token, never an input `user_id`.
- OAuth rows are inaccessible to anonymous and authenticated browser database
  clients. Only narrowly used server-side OAuth persistence uses the service
  role. All project operations use a Supabase client authenticated as the token
  owner, with RLS enabled; session-minting failure denies access.
- The verified Supabase session user must match the token owner.
- Tokens and connections are checked for revocation, expiration, matching
  identity, matching resource, and permissions on every request. Existing
  Creator Studio entitlement checks apply to external Studio access; managed
  customer-order tools do not require a Studio subscription.
- Listing and project checks explicitly require `creator_projects.user_id` to
  match the connected user, including for administrators. Projects shared by
  another account are excluded from this integration.
- Supplied episodes, chat sessions, and proposals must belong to the selected
  owned project and user. Stored-media signing checks the owner's storage
  prefix and uses their RLS client.
- Each HTTP request creates its own MCP server with its own bearer credential.
  The hosted service never reads a shared `STUDIO_ACCESS_TOKEN` or stores an MCP
  user's credentials in a global variable.
- Consent is bound to an HttpOnly cookie and random transaction ID, requires a
  same-origin POST, and rejects account changes between display and approval.
- Code exchange and refresh rotation lock database rows. Concurrent replay
  cannot create two access tokens. Only hashes of credentials are persisted.

The existing local stdio bridge remains available separately. Its external
access authentication also now fails closed and enforces active entitlement.

## Validation and release checks

```bash
npm run test -- src/lib/studio/mcp
npm run typecheck
```

Tests include the real SDK HTTP client, two concurrent account connections,
foreign project/session denial, browser consent/account changes, expiration and
revocation, PKCE validation, and the migration executed on embedded PostgreSQL
with role/RLS and atomic code/refresh exchange checks.

Before releasing, perform a staging smoke test with two real Supabase users:
connect each through the target MCP client, list and create projects, attempt
User B's IDs using User A's connection, request a generation, inspect and approve
its proposal, view the result, and disconnect. Embedded tests use representative
workspace RLS policies; they do not substitute for verifying the deployed
project's complete policies, Google callback configuration, and provider jobs.

Maintenance: delete expired `creator_mcp_requests`/`creator_mcp_codes`, old rate
limit buckets, and expired revoked OAuth credentials through your existing
server maintenance process. Keep registered clients stable while connections
are active. No cleanup schedule or production deployment is created by this
implementation.

## Hire Our Team customer projects

The existing `/hire-us` purchase and brief flow creates the customer's
`managed_projects` order after verified payment. Producers open its linked
Creator Studio workspace through the admin Managed Production panel; the brief,
brand context, and uploaded product references are imported by the existing
bridge. This workspace remains owned by the producing team.

Apply `20261001130000_managed_delivery_plan.sql` along with the hosted-MCP
migration before deploying the customer tracking additions. The admin panel now
has **Customer delivery plan** controls for an expected delivery datetime, a
public current-work update, and remaining tasks. Saving records the plan and
adds a customer-visible project-chat message. Status changes also add chat
updates; private admin notes are excluded. A date is unconfirmed until the team
sets it. Stage-derived next steps are labelled separately from a team-authored
remaining-work list.

The customer project page shows the plan and, after completion, a final-delivery
card inside the project chat. Completion is guarded in PostgreSQL: the order
must be paid and every purchased deliverable approved with a published final
file. New completions record `completed_at`; older completed orders without a
recorded completion time simply show Completed.

Additional OAuth permissions and tools:

| Permission | Tools |
| --- | --- |
| `managed:read` | `managed_list_projects`, `managed_project_status`, `managed_project_delivery` |
| `managed:messages` | `managed_project_message` |

Customers do not need a Studio subscription to connect their managed orders.
For an account without Studio access, consent grants only requested managed
permissions, and MCP exposes only those tools. Existing connections need to
reconnect to grant the new permissions; old tokens are not silently expanded.

Every external managed-project access explicitly checks the order's `user_id`
against the token's user, even when that user is an administrator. The completed
project tool returns the brief, customer chat, and signed viewing links for
approved published files. It never returns internal production IDs, admin notes,
or unused Studio takes. An editable customer-owned Studio copy is a separate
handover option, not part of this final-delivery implementation.

Customers can ask: "Show my hired projects", "What's left on my perfume ad and
when will it be delivered?", or "Show the completed project and final videos".
Sending a message to the team requires the customer's explicit instruction.
This change does not send live messages, take a payment, apply migrations, or
publish the deployment during development. Smoke-test a real payment and two
customer accounts in staging before release.
