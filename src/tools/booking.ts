import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CalMeshClient } from '../client.js';
import { toolError, toolResult } from './util.js';
import type { Booking, BookingsResult, SlotsResult } from '../types.js';

export function registerBookingTools(server: McpServer, client: CalMeshClient): void {
  server.registerTool(
    'calmesh_get_slots',
    {
      description:
        'Get available booking slots for a booking page on a given date. Returns time slots visitors can book. Requires "book" scope.',
      inputSchema: {
        slug: z.string().max(60).describe('Booking page slug.'),
        date: z.string().describe('Date in YYYY-MM-DD format.'),
        timezone: z.string().optional().describe('IANA timezone for the returned slots (e.g. Europe/Berlin).'),
      },
    },
    async ({ slug, date, timezone }) => {
      try {
        const from = `${date}T00:00:00`;
        const to = `${date}T23:59:59.999`;
        const result = await client.get<SlotsResult>(
          `/api/v1/booking-pages/${encodeURIComponent(slug)}/slots`,
          { from, to, timezone },
        );
        return toolResult(result.slots.map((s) => ({ start: s.start, end: s.end })));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'calmesh_create_booking',
    {
      description:
        'Create a new booking on a booking page. Returns booking ID, status, and confirmed time. Requires "book" scope.',
      inputSchema: {
        booking_page_slug: z.string().max(60).describe('Booking page slug to book on.'),
        visitor_name: z.string().max(200).describe('Full name of the person booking.'),
        visitor_email: z.string().email().describe('Email address of the person booking.'),
        visitor_timezone: z.string().describe('IANA timezone of the visitor (e.g. America/New_York).'),
        start_time: z.string().datetime().describe('Desired start time as ISO 8601 datetime. Must be an available slot.'),
        notes: z.string().max(2000).optional().describe('Optional notes or message from the visitor.'),
      },
    },
    async ({ booking_page_slug, visitor_name, visitor_email, visitor_timezone, start_time, notes }) => {
      try {
        const result = await client.post<Booking>(
          `/api/v1/booking-pages/${encodeURIComponent(booking_page_slug)}/book`,
          {
            visitorName: visitor_name,
            visitorEmail: visitor_email,
            visitorTimezone: visitor_timezone,
            startTime: start_time,
            notes,
          },
        );
        return toolResult({
          id: result.id,
          status: result.status,
          startTime: result.startTime,
          endTime: result.endTime,
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'calmesh_cancel_booking',
    {
      description: 'Cancel an existing booking by ID. Returns the booking ID and cancelled status. Requires "book" scope.',
      inputSchema: {
        booking_id: z.string().describe('ID of the booking to cancel.'),
      },
    },
    async ({ booking_id }) => {
      try {
        await client.del(`/api/v1/bookings/${encodeURIComponent(booking_id)}`);
        return toolResult({ id: booking_id, status: 'cancelled' });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'calmesh_list_bookings',
    {
      description:
        'List bookings with optional pagination and filtering. Returns booking details including visitor info and status. Requires "book" scope.',
      inputSchema: {
        limit: z.number().min(1).max(200).optional().describe('Max bookings to return (1-200). Defaults to 50.'),
        offset: z.number().min(0).optional().describe('Number of bookings to skip for pagination. Defaults to 0.'),
        stakeholder_id: z.string().optional().describe('Filter bookings assigned to a specific stakeholder ID.'),
      },
    },
    async ({ limit, offset, stakeholder_id }) => {
      try {
        const result = await client.get<BookingsResult>('/api/v1/bookings', {
          limit,
          offset,
          stakeholderId: stakeholder_id,
        });
        return toolResult(
          result.bookings.map((b) => ({
            id: b.id,
            visitorName: b.visitorName,
            visitorEmail: b.visitorEmail,
            startTime: b.startTime,
            endTime: b.endTime,
            status: b.status,
            notes: b.notes,
          })),
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
