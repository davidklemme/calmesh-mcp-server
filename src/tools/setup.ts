import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CalMeshClient } from '../client.js';
import { toolError, toolResult } from './util.js';
import type {
  CalendarSource,
  Connection,
  ConnectionStatus,
  CredentialConnectionResult,
  OAuthConnectionResult,
  UnifiedCalendar,
} from '../types.js';

export function registerSetupTools(server: McpServer, client: CalMeshClient): void {
  server.registerTool(
    'calmesh_start_oauth_connection',
    {
      description:
        'Start an OAuth calendar connection. Returns an auth_url the user must visit in their browser to authorize access. Requires "full" scope.',
      inputSchema: {
        provider: z.enum(['google', 'microsoft']).describe("Calendar provider: 'google' or 'microsoft'."),
      },
    },
    async ({ provider }) => {
      try {
        const result = await client.post<OAuthConnectionResult>(
          `/api/v1/connections/${encodeURIComponent(provider)}`,
        );
        return toolResult({
          auth_url: result.auth_url,
          message: `Open this URL in your browser to connect your ${provider} calendar: ${result.auth_url}`,
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'calmesh_start_credential_connection',
    {
      description:
        'Connect a CalDAV server or iCal URL using credentials. For CalDAV: server URL, username, and password required. For iCal URL: only the public URL is needed. Requires "full" scope.',
      inputSchema: {
        provider: z.enum(['caldav', 'ical_url']).describe("Connection type: 'caldav' or 'ical_url'."),
        url: z.string().describe('CalDAV server URL or iCal feed URL.'),
        username: z.string().optional().describe('Username for CalDAV authentication. Required for caldav provider.'),
        password: z.string().optional().describe('Password for CalDAV authentication. Required for caldav provider.'),
      },
    },
    async ({ provider, url, username, password }) => {
      try {
        const body: Record<string, string> = { url };
        if (username) body.username = username;
        if (password) body.password = password;

        const result = await client.post<CredentialConnectionResult>(
          `/api/v1/connections/${encodeURIComponent(provider)}`,
          body,
        );
        return toolResult({
          connection_id: result.id,
          status: result.status,
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'calmesh_check_connection_status',
    {
      description: 'Check the sync status of a calendar connection. Shows if the connection is active, errored, or disconnected. Requires "full" scope.',
      inputSchema: {
        connection_id: z.string().describe('Connection ID to check.'),
      },
    },
    async ({ connection_id }) => {
      try {
        const result = await client.get<ConnectionStatus>(
          `/api/v1/connections/${encodeURIComponent(connection_id)}/status`,
        );
        return toolResult({
          id: result.id,
          provider: result.provider,
          status: result.status,
          errorMessage: result.errorMessage,
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'calmesh_list_connections',
    {
      description: 'List all calendar connections for the authenticated user. Shows provider, status, and last sync time. Requires "full" scope.',
      inputSchema: {},
    },
    async () => {
      try {
        const connections = await client.get<Connection[]>('/api/v1/connections');
        return toolResult(
          connections.map((c) => ({
            id: c.id,
            provider: c.provider,
            displayName: c.displayName,
            status: c.status,
            lastSyncedAt: c.lastSyncedAt,
          })),
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'calmesh_remove_connection',
    {
      description: 'Remove a calendar connection. This disconnects the provider and stops syncing. Requires "full" scope.',
      inputSchema: {
        connection_id: z.string().describe('Connection ID to remove.'),
      },
    },
    async ({ connection_id }) => {
      try {
        await client.del(`/api/v1/connections/${encodeURIComponent(connection_id)}`);
        return toolResult({ removed: true, connection_id });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'calmesh_create_calendar',
    {
      description:
        'Create a new unified calendar and optionally attach connection sources. Returns the calendar and source attachment results (may be partial on failure). Requires "full" scope.',
      inputSchema: {
        name: z.string().min(1).max(200).describe('Calendar display name (1-200 chars).'),
        slug: z.string().min(3).max(60).optional().describe('URL slug (3-60 chars, lowercase alphanumeric + hyphens). Auto-generated if omitted.'),
        timezone: z.string().optional().describe('IANA timezone (e.g. Europe/Berlin). Defaults to UTC.'),
        connection_ids: z
          .array(z.string())
          .optional()
          .describe('Connection IDs to attach as calendar sources.'),
      },
    },
    async ({ name, slug, timezone, connection_ids }) => {
      try {
        const calendar = await client.post<UnifiedCalendar>('/api/v1/calendars', {
          name,
          slug,
          timezone: timezone ?? 'UTC',
        });

        const sourcesAdded: string[] = [];
        const sourcesFailed: Array<{ id: string; error: string }> = [];

        if (connection_ids?.length) {
          for (const connId of connection_ids) {
            try {
              await client.post<CalendarSource>(
                `/api/v1/calendars/${encodeURIComponent(calendar.slug)}/sources`,
                { connectionId: connId },
              );
              sourcesAdded.push(connId);
            } catch (err) {
              sourcesFailed.push({
                id: connId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        }

        return toolResult({
          calendar: {
            name: calendar.name,
            slug: calendar.slug,
            timezone: calendar.timezone,
            isDefault: calendar.isDefault,
          },
          sources_added: sourcesAdded,
          sources_failed: sourcesFailed,
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'calmesh_manage_calendar',
    {
      description:
        'Update a calendar: rename, change timezone, add/remove connection sources, set write-back connection. Returns what succeeded and what failed. Requires "full" scope.',
      inputSchema: {
        slug: z.string().max(60).describe('Calendar slug to manage.'),
        name: z.string().max(200).optional().describe('New calendar name.'),
        timezone: z.string().optional().describe('New IANA timezone.'),
        add_connections: z.array(z.string()).optional().describe('Connection IDs to add as sources.'),
        remove_connections: z.array(z.string()).optional().describe('Source IDs to remove.'),
        write_back_connection: z.string().optional().describe('Connection ID to use for writing back events.'),
      },
    },
    async ({ slug, name, timezone, add_connections, remove_connections, write_back_connection }) => {
      try {
        let updated = false;
        const sourcesAdded: string[] = [];
        const sourcesRemoved: string[] = [];
        const sourcesFailed: Array<{ id: string; error: string }> = [];
        let writeBackSet = false;

        // Update calendar metadata (merge name, timezone, writeBack into one PATCH)
        const patchBody: Record<string, string> = {};
        if (name) patchBody.name = name;
        if (timezone) patchBody.timezone = timezone;
        if (write_back_connection) patchBody.writeBackConnectionId = write_back_connection;

        if (Object.keys(patchBody).length > 0) {
          try {
            await client.patch(`/api/v1/calendars/${encodeURIComponent(slug)}`, patchBody);
            updated = true;
            if (write_back_connection) writeBackSet = true;
          } catch (err) {
            if (write_back_connection) {
              sourcesFailed.push({
                id: write_back_connection,
                error: `write-back: ${err instanceof Error ? err.message : String(err)}`,
              });
            } else {
              throw err;
            }
          }
        }

        // Add sources
        if (add_connections?.length) {
          for (const connId of add_connections) {
            try {
              await client.post(
                `/api/v1/calendars/${encodeURIComponent(slug)}/sources`,
                { connectionId: connId },
              );
              sourcesAdded.push(connId);
            } catch (err) {
              sourcesFailed.push({
                id: connId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        }

        // Remove sources
        if (remove_connections?.length) {
          for (const sourceId of remove_connections) {
            try {
              await client.del(
                `/api/v1/calendars/${encodeURIComponent(slug)}/sources/${encodeURIComponent(sourceId)}`,
              );
              sourcesRemoved.push(sourceId);
            } catch (err) {
              sourcesFailed.push({
                id: sourceId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        }

        return toolResult({
          updated: updated || sourcesAdded.length > 0 || sourcesRemoved.length > 0 || writeBackSet,
          sources_added: sourcesAdded,
          sources_removed: sourcesRemoved,
          sources_failed: sourcesFailed,
          write_back_set: writeBackSet,
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
