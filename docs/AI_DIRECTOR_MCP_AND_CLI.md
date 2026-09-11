# AI Director MCP and CLI

AI Director Hub can be controlled outside the web app through a bearer token, a CLI, and an MCP stdio server.

This lets a creator talk to the same AI Director agent from tools such as Claude Desktop or another MCP-capable chat client.

## External Access Token

Signed-in users can create external tokens with:

```bash
POST /api/studio/external/tokens
```

The response includes the token once. Store it securely.

Available scopes:

- `projects:read`
- `director:chat`
- `director:tools`
- `director:uploads` — send an image or clip into a project as a reference
- `director:proposals` — approve or reject what the Director proposes

The last two were added because a client that can run the Director's tools but
can neither hand it a picture nor approve what it proposes cannot finish a single
costly job.

Tokens can be listed with:

```bash
GET /api/studio/external/tokens
```

Tokens can be revoked with:

```bash
DELETE /api/studio/external/tokens/:tokenId
```

## CLI

```bash
export AI_DIRECTOR_BASE_URL=http://localhost:3000
export AI_DIRECTOR_TOKEN=aih_your_token_here

npm run director:cli -- projects
npm run director:cli -- chat <projectId> <episodeId> "Create a storyboard for a perfume ad"
npm run director:cli -- tool <projectId> inspect_current_project '{}'
```

## MCP Server

The server lives in `mcp/` and is registered in the repository's `.mcp.json`, so
a Claude Code session in this directory picks it up with no further setup. Full
detail is in [`mcp/README.md`](../mcp/README.md).

Mint a token for the account that **owns** the projects, and put it in
`.env.local` — never in `.mcp.json`, which is tracked:

```bash
node scripts/mint-studio-token.mjs you@example.com
```

```
STUDIO_ACCESS_TOKEN=aih_...
STUDIO_BASE_URL=http://localhost:3000
```

`AI_DIRECTOR_TOKEN` and `AI_DIRECTOR_BASE_URL` are accepted as aliases, so the
CLI and the server share one configuration. Point `STUDIO_BASE_URL` at the
deployed site to work against production.

For a client with its own config file (Claude Desktop, or Claude Code at user
scope):

```json
{
  "mcpServers": {
    "ai-director": {
      "command": "node",
      "args": ["/absolute/path/to/mannaistudio/mcp/server.mjs"]
    }
  }
}
```

No `env` block is needed: the server reads `.env.local` relative to its own
file, so it works from any working directory.

> An earlier server at `scripts/ai-director-mcp-server.mjs` was removed. It
> framed messages with `Content-Length` headers, which is the Language Server
> Protocol's convention — MCP's stdio transport is newline-delimited JSON — so no
> standard MCP client could ever have spoken to it.

## MCP Tools

| Tool | Does |
| :--- | :--- |
| `studio_list_projects` | Projects, episodes, and the default episode/session ids other tools need |
| `studio_storyboard` | One episode's shots and cast; `includeSignedUrls` or `includeThumbnails` for rendering it |
| `studio_chat` | Sends a message to the Director — full conversational parity |
| `studio_run_director_tool` | Calls any of the Director's own tools directly |
| `studio_list_director_tools` | Their names, read from the registry so they cannot drift |
| `studio_upload_media` | A local image or clip into a project, for use as a reference |
| `studio_decide_proposal` | Approves or rejects a costly or destructive action |
| `studio_pending_work` | Pending proposals, running jobs, episode spend |
| `studio_view_media` | A stored image, inline in the conversation |

Write, destructive, and costly Director tools still use the existing
proposal/approval system. Video generation remains approval-first unless the user
has explicitly enabled full-auto mode.

## What a token can reach

A token holder is served by a Supabase session minted **for the user the token
belongs to**, not by the service client. `auth.uid()` therefore resolves and RLS
applies exactly as it does in that user's browser — which is what lets the
Director's SECURITY DEFINER functions (approvals, credit reservation, job
claiming) work at all through this path. See `src/lib/studio/external-auth.ts`.

A token is deliberately narrower than a browser session: it opens only projects
its minter **owns**, never one merely shared with them. Revoke one by setting
`revoked_at` on its row in `creator_external_access_tokens`.

## HTTP API Used by MCP/CLI

```bash
GET /api/studio/external/projects
Authorization: Bearer <token>
```

```bash
POST /api/studio/projects/:projectId/director/chat
Authorization: Bearer <token>
Content-Type: application/json

{
  "episodeId": "...",
  "sessionId": "...",
  "message": "Plan a 20 second ad",
  "idempotencyKey": "external-unique-key"
}
```

```bash
POST /api/studio/projects/:projectId/director/tools
Authorization: Bearer <token>
Content-Type: application/json

{
  "tool": "inspect_current_project",
  "input": {},
  "idempotencyKey": "external-unique-key"
}
```
