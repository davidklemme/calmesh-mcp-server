import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CalMeshClient } from '../client.js';
import { toolError, toolResult } from './util.js';
import type { Poll, PollDecideResult, PollOverlapResult } from '../types.js';

export function registerPollTools(server: McpServer, client: CalMeshClient): void {
  server.registerTool(
    'calmesh_create_poll',
    {
      description:
        'Create a scheduling poll and send invitation emails to participants. Returns the poll with a shareable URL. Requires "book" scope.',
      inputSchema: {
        title: z.string().min(1).max(200).describe('Poll title (1-200 chars).'),
        date_range_start: z.string().describe('Start of date range in YYYY-MM-DD format.'),
        date_range_end: z.string().describe('End of date range in YYYY-MM-DD format.'),
        duration_minutes: z.number().min(5).max(480).optional().describe('Meeting duration in minutes (5-480). Defaults to 30.'),
        timezone: z.string().describe('IANA timezone for the poll (e.g. Europe/Berlin).'),
        participants: z
          .array(
            z.object({
              email: z.string().email().describe('Participant email address.'),
              name: z.string().max(200).optional().describe('Participant display name.'),
            }),
          )
          .min(1)
          .max(50)
          .describe('List of participants to invite (1-50).'),
      },
    },
    async ({ title, date_range_start, date_range_end, duration_minutes, timezone, participants }) => {
      try {
        const result = await client.post<Poll>('/api/v1/polls', {
          title,
          dateRangeStart: date_range_start,
          dateRangeEnd: date_range_end,
          durationMinutes: duration_minutes ?? 30,
          timezone,
          participants,
        });
        return toolResult({
          id: result.id,
          title: result.title,
          slug: result.slug,
          status: result.status,
          pollUrl: result.pollUrl,
          expiresAt: result.expiresAt,
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'calmesh_list_polls',
    {
      description: 'List all scheduling polls. Returns poll details with participant counts and status. Requires "read" scope.',
      inputSchema: {},
    },
    async () => {
      try {
        const polls = await client.get<Poll[]>('/api/v1/polls');
        return toolResult(
          polls.map((p) => ({
            title: p.title,
            slug: p.slug,
            status: p.status,
            dateRange: `${p.dateRangeStart} to ${p.dateRangeEnd}`,
            durationMinutes: p.durationMinutes,
            timezone: p.timezone,
            participantCount: p.participants?.length ?? 0,
            decidedTime: p.decidedTime,
            expiresAt: p.expiresAt,
          })),
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'calmesh_get_poll_overlap',
    {
      description:
        'Get overlapping availability slots for a poll. Shows which time slots work for the most participants. Requires "read" scope.',
      inputSchema: {
        slug: z.string().max(60).describe('Poll slug.'),
      },
    },
    async ({ slug }) => {
      try {
        const result = await client.get<PollOverlapResult>(
          `/api/v1/polls/${encodeURIComponent(slug)}/overlap`,
        );
        return toolResult({
          totalParticipants: result.totalParticipants,
          respondedCount: result.respondedCount,
          pendingCount: result.pendingCount,
          slots: result.slots.map((s) => ({
            start: s.start,
            end: s.end,
            overlapCount: s.overlapCount,
            availableParticipants: s.availableParticipants,
            missingParticipants: s.missingParticipants,
          })),
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'calmesh_decide_poll',
    {
      description: 'Finalize a poll by selecting the decided meeting time. Marks the poll as decided. Requires "book" scope.',
      inputSchema: {
        slug: z.string().max(60).describe('Poll slug.'),
        decided_time: z.string().datetime().describe('The chosen meeting time as ISO 8601 datetime.'),
      },
    },
    async ({ slug, decided_time }) => {
      try {
        const result = await client.post<PollDecideResult>(
          `/api/v1/polls/${encodeURIComponent(slug)}/decide`,
          { decidedTime: decided_time },
        );
        return toolResult({
          pollId: result.pollId,
          status: result.status,
          decidedTime: result.decidedTime,
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
