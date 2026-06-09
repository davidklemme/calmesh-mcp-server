import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CalMeshClient } from '../client.js';
import { toolError, toolResult } from './util.js';
import type { AvailabilityResult, ConflictsResult, CreateEventResult, EventDetailsResult, EventsResult, UnifiedCalendar } from '../types.js';

export function registerCoreTools(server: McpServer, client: CalMeshClient): void {
  server.registerTool(
    'calmesh_list_calendars',
    {
      description:
        'List all unified calendars for the authenticated user. Returns name, slug, timezone, and default status for each calendar. Requires "read" scope.',
      inputSchema: {},
    },
    async () => {
      try {
        const calendars = await client.get<UnifiedCalendar[]>('/api/v1/calendars');
        return toolResult(
          calendars.map((c) => ({
            name: c.name,
            slug: c.slug,
            timezone: c.timezone,
            isDefault: c.isDefault,
          })),
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'calmesh_get_events',
    {
      description:
        'Get calendar events within a date range. Returns event title, start/end times, status, and source connection. Requires "read" scope.',
      inputSchema: {
        slug: z.string().max(60).describe('Calendar slug. Use calmesh_list_calendars to find available slugs.'),
        start: z.string().describe('Range start as ISO 8601 datetime (e.g. 2025-03-21T00:00:00Z).'),
        end: z.string().describe('Range end as ISO 8601 datetime (e.g. 2025-03-21T23:59:59Z).'),
        limit: z.number().min(1).max(500).optional().describe('Max events to return (1-500). Defaults to 200.'),
        offset: z.number().min(0).optional().describe('Number of events to skip for pagination. Defaults to 0.'),
      },
    },
    async ({ slug, start, end, limit, offset }) => {
      try {
        const result = await client.get<EventsResult>(`/api/v1/calendars/${encodeURIComponent(slug)}/events`, {
          from: start,
          to: end,
          limit,
          offset,
        });
        return toolResult(
          result.events.map((e) => ({
            start: e.startTime,
            end: e.endTime,
            status: e.status,
            isAllDay: e.isAllDay,
          })),
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'calmesh_get_event_details',
    {
      description:
        'Get full event details (title, description, location) for a date range. Fetches from calendar providers on demand. Use this when you need to understand what events are about, not just when they occur. Requires "read" scope.',
      inputSchema: {
        slug: z.string().max(60).describe('Calendar slug. Use calmesh_list_calendars to find available slugs.'),
        start: z.string().describe('Range start as ISO 8601 datetime (e.g. 2025-03-21T00:00:00Z).'),
        end: z.string().describe('Range end as ISO 8601 datetime (e.g. 2025-03-21T23:59:59Z).'),
      },
    },
    async ({ slug, start, end }) => {
      try {
        const result = await client.get<EventDetailsResult>(`/api/v1/calendars/${encodeURIComponent(slug)}/events/details`, {
          from: start,
          to: end,
        });
        return toolResult(
          result.events.map((e) => ({
            title: e.summary,
            start: e.startTime,
            end: e.endTime,
            status: e.status,
            isAllDay: e.isAllDay,
            description: e.description,
            location: e.location,
          })),
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'calmesh_check_availability',
    {
      description:
        'Check available time slots on a calendar for a given date. Returns free slots where meetings can be scheduled. Requires "read" scope.',
      inputSchema: {
        slug: z.string().max(60).describe('Calendar slug. Use calmesh_list_calendars to find available slugs.'),
        date: z
          .string()
          .optional()
          .describe('Date in YYYY-MM-DD format. Defaults to today, resolved in the specified timezone (default: UTC).'),
        timezone: z.string().optional().describe('IANA timezone (e.g. America/New_York). Defaults to UTC.'),
        duration: z
          .number()
          .min(5)
          .max(480)
          .optional()
          .describe('Slot duration in minutes (5-480). Defaults to 30.'),
      },
    },
    async ({ slug, date, timezone, duration }) => {
      try {
        const day = date ?? new Date().toISOString().split('T')[0];
        const from = `${day}T00:00:00`;
        const to = `${day}T23:59:59.999`;

        const result = await client.get<AvailabilityResult>(
          `/api/v1/calendars/${encodeURIComponent(slug)}/availability`,
          {
            from,
            to,
            duration: duration ?? 30,
            timezone,
          },
        );
        return toolResult({
          timezone: result.timezone,
          slots: result.slots.map((s) => ({ start: s.start, end: s.end })),
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'calmesh_create_event',
    {
      description:
        'Create a calendar event on a connected calendar. The event is written to the default write target (first writable source by sort order) unless a specific sourceId is provided. Use calmesh_list_calendars to find calendar slugs. Requires "write" scope or higher.',
      inputSchema: {
        slug: z.string().max(60).describe('Calendar slug. Use calmesh_list_calendars to find available slugs.'),
        summary: z.string().min(1).max(500).describe('Event title.'),
        description: z.string().max(5000).optional().describe('Event description.'),
        location: z.string().max(500).optional().describe('Event location.'),
        start_time: z.string().describe('Start time as ISO 8601 datetime (e.g. 2025-04-01T10:00:00Z).'),
        end_time: z.string().describe('End time as ISO 8601 datetime. Must be after start_time, max 24h duration.'),
        timezone: z.string().describe('IANA timezone (e.g. Europe/Berlin, America/New_York).'),
        source_id: z.string().uuid().optional().describe('Optional: specific source UUID to write to instead of the default. Use calmesh_list_calendars sources to find IDs.'),
      },
    },
    async ({ slug, summary, description, location, start_time, end_time, timezone, source_id }) => {
      try {
        const result = await client.post<CreateEventResult>(
          `/api/v1/calendars/${encodeURIComponent(slug)}/events`,
          {
            summary,
            description,
            location,
            startTime: start_time,
            endTime: end_time,
            timezone,
            sourceId: source_id,
          },
        );
        return toolResult({
          remoteEventId: result.remoteEventId,
          sourceId: result.sourceId,
          message: `Event "${summary}" created successfully.`,
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'calmesh_delete_event',
    {
      description:
        'Delete a calendar event from a connected calendar. Requires the remoteEventId (from calmesh_create_event or calmesh_get_events) and the sourceId identifying which calendar source to delete from. Requires "write" scope or higher.',
      inputSchema: {
        slug: z.string().max(60).describe('Calendar slug.'),
        remote_event_id: z.string().min(1).describe('The provider event ID to delete (returned by calmesh_create_event).'),
        source_id: z.string().uuid().describe('Source UUID the event belongs to (returned by calmesh_create_event).'),
      },
    },
    async ({ slug, remote_event_id, source_id }) => {
      try {
        await client.del(
          `/api/v1/calendars/${encodeURIComponent(slug)}/events`,
          {
            remoteEventId: remote_event_id,
            sourceId: source_id,
          },
        );
        return toolResult({ message: 'Event deleted successfully.' });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'calmesh_find_conflicts',
    {
      description:
        'Find overlapping events (conflicts) within a date range. Returns pairs of events that overlap in time. Requires "read" scope.',
      inputSchema: {
        slug: z.string().max(60).describe('Calendar slug. Use calmesh_list_calendars to find available slugs.'),
        start: z.string().describe('Range start as ISO 8601 datetime.'),
        end: z.string().describe('Range end as ISO 8601 datetime.'),
      },
    },
    async ({ slug, start, end }) => {
      try {
        const result = await client.get<ConflictsResult>(
          `/api/v1/calendars/${encodeURIComponent(slug)}/conflicts`,
          { start, end },
        );
        return toolResult(
          result.conflicts.map((c) => ({
            eventA: { title: c.eventA.summary, start: c.eventA.startTime, end: c.eventA.endTime },
            eventB: { title: c.eventB.summary, start: c.eventB.startTime, end: c.eventB.endTime },
          })),
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
