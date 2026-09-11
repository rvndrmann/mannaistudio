# AI Director MCP bridge

Drives the studio from an MCP client (Claude Code, Claude Desktop) using the
same API the browser uses, as the same user.

## Setup

1. Mint a token for the account that **owns** the projects you want to reach:

   ```bash
   node scripts/mint-studio-token.mjs you@example.com
   ```

2. Put it in `.env.local` (gitignored — never `.mcp.json`, which is tracked):

   ```
   STUDIO_ACCESS_TOKEN=aih_...
   STUDIO_BASE_URL=http://localhost:3000
   ```

3. `.mcp.json` already registers the server. Restart the MCP client.

Point `STUDIO_BASE_URL` at the deployed site to work against production.

## Tools

| Tool | Does |
|------|------|
| `studio_list_projects` | Projects, episodes, default session ids |
| `studio_storyboard` | One episode's shots, entities; `includeSignedUrls` for rendering |
| `studio_chat` | Talk to the AI Director — full conversational parity |
| `studio_run_director_tool` | Call any of its 35 tools directly |
| `studio_list_director_tools` | Their names |
| `studio_upload_media` | Local image/video → project storage, for use as a reference |
| `studio_decide_proposal` | Approve or reject a costly action |
| `studio_pending_work` | Pending proposals, running jobs, credit balance |
| `studio_view_media` | A stored image, inline in the conversation |

## Security

A token is an `aih_` key held in a config file, so it is deliberately narrower
than a browser session: it opens only projects **owned** by the user who minted
it, never one merely shared with them. Scopes are per-token, and revoking is a
`revoked_at` on its row in `creator_external_access_tokens`.

Anything costly still comes back as a proposal. The bridge cannot spend credits
without a second call that says so.
