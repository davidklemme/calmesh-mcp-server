# @calmesh/mcp-server

MCP server for [CalMesh](https://calmesh.xyz) — AI-first calendar infrastructure. Connects AI agents to your calendars, bookings, and scheduling polls via the [Model Context Protocol](https://modelcontextprotocol.io).

## Quick Start

```bash
CALMESH_API_KEY=cm_live_... npx @calmesh/mcp-server
```

## Setup

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "calmesh": {
      "command": "npx",
      "args": ["@calmesh/mcp-server"],
      "env": {
        "CALMESH_API_KEY": "cm_live_your_key_here"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "calmesh": {
      "command": "npx",
      "args": ["@calmesh/mcp-server"],
      "env": {
        "CALMESH_API_KEY": "cm_live_your_key_here"
      }
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "calmesh": {
      "command": "npx",
      "args": ["@calmesh/mcp-server"],
      "env": {
        "CALMESH_API_KEY": "cm_live_your_key_here"
      }
    }
  }
}
```

## Available Tools

### Core Tools

#### Read operations (require `read` scope)

| Tool | Description |
|------|-------------|
| `calmesh_list_calendars` | List all unified calendars |
| `calmesh_get_events` | Get events within a date range |
| `calmesh_get_event_details` | Get full event details (title, description, location) |
| `calmesh_check_availability` | Check available time slots |
| `calmesh_find_conflicts` | Find overlapping events |

#### Write operations (require `write` scope)

| Tool | Description |
|------|-------------|
| `calmesh_create_event` | Create a calendar event |
| `calmesh_delete_event` | Delete a calendar event |

### Booking Tools (require `book` scope)

| Tool | Description |
|------|-------------|
| `calmesh_get_slots` | Get available booking slots |
| `calmesh_create_booking` | Create a new booking |
| `calmesh_cancel_booking` | Cancel a booking |
| `calmesh_list_bookings` | List bookings with pagination |

### Poll Tools (require `book` scope for create/decide, `read` for list/overlap)

| Tool | Description |
|------|-------------|
| `calmesh_create_poll` | Create a scheduling poll |
| `calmesh_list_polls` | List all polls |
| `calmesh_get_poll_overlap` | Get participant overlap |
| `calmesh_decide_poll` | Finalize poll with chosen time |

### Setup Tools (require `full` scope)

| Tool | Description |
|------|-------------|
| `calmesh_start_oauth_connection` | Connect Google or Microsoft calendar |
| `calmesh_start_credential_connection` | Connect CalDAV or iCal URL |
| `calmesh_check_connection_status` | Check connection sync status |
| `calmesh_list_connections` | List all connections |
| `calmesh_remove_connection` | Remove a connection |
| `calmesh_create_calendar` | Create unified calendar with sources |
| `calmesh_manage_calendar` | Update calendar, manage sources |

## HTTP Transport

For remote or hosted MCP clients, use the HTTP transport:

```bash
CALMESH_API_KEY=cm_live_... \
CALMESH_HTTP_SECRET=your_secret_token \
npx @calmesh/mcp-server --transport http --port 3100
```

The server binds to `127.0.0.1` by default. All requests must include `Authorization: Bearer <http-secret>`.

## CLI Options

```
--api-key <key>       CalMesh API key (prefer CALMESH_API_KEY env var)
--base-url <url>      API base URL (default: https://calmesh.xyz)
--transport <type>    stdio (default) or http
--port <port>         HTTP port (default: 3100)
--host <host>         HTTP host (default: 127.0.0.1)
--http-secret <token> Required for HTTP transport
--help                Show help
--version             Show version
```

## Troubleshooting

**"Invalid or expired API key"**
Generate a new API key at [calmesh.xyz/dashboard/api-keys](https://calmesh.xyz/dashboard/api-keys).

**"Insufficient permissions"**
Your API key scope is too low. Core tools need `read`, booking tools need `book`, setup tools need `full`.

**"Rate limit exceeded"**
Wait a moment and retry.

**"Unable to reach CalMesh API"**
Check your network connection and `--base-url` value.

**"CalMesh API request timed out"**
Requests time out after 30 seconds. Retry or check service status.

**HTTP transport "Unauthorized"**
Ensure your client sends `Authorization: Bearer <http-secret>` with every request.
