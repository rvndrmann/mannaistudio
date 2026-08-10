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

Run:

```bash
AI_DIRECTOR_BASE_URL=http://localhost:3000 \
AI_DIRECTOR_TOKEN=aih_your_token_here \
npm run director:mcp
```

Example Claude Desktop config:

```json
{
  "mcpServers": {
    "ai-director-hub": {
      "command": "node",
      "args": ["/Users/apple/Downloads/mannaistudio/scripts/ai-director-mcp-server.mjs"],
      "env": {
        "AI_DIRECTOR_BASE_URL": "http://localhost:3000",
        "AI_DIRECTOR_TOKEN": "aih_your_token_here"
      }
    }
  }
}
```

## MCP Tools

The MCP server exposes:

- `list_projects`: lists projects plus default episode/session IDs.
- `director_chat`: sends a message to the AI Director agent.
- `director_tool`: calls an AI Director tool such as `inspect_current_project`, `update_script`, or `submit_generation`.

Write, destructive, and costly Director tools still use the existing proposal/approval system. Video generation remains approval-first unless the user has explicitly enabled full-auto mode.

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
