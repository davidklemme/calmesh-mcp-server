import { describe, it, expect, beforeEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CalMeshClient } from '../client.js';
import { createServer } from '../server.js';

describe('createServer', () => {
  let mcpClient: Client;

  beforeEach(async () => {
    const apiClient = new CalMeshClient('cm_live_test', 'https://calmesh.xyz');
    const server = createServer(apiClient);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    mcpClient = new Client({ name: 'test-client', version: '1.0.0' });

    await Promise.all([
      mcpClient.connect(clientTransport),
      server.connect(serverTransport),
    ]);
  });

  it('registers exactly 22 tools', async () => {
    const result = await mcpClient.listTools();
    expect(result.tools).toHaveLength(22);
  });

  it('includes all expected tool names', async () => {
    const result = await mcpClient.listTools();
    const names = result.tools.map((t) => t.name).sort();

    expect(names).toEqual([
      'calmesh_cancel_booking',
      'calmesh_check_availability',
      'calmesh_check_connection_status',
      'calmesh_create_booking',
      'calmesh_create_calendar',
      'calmesh_create_event',
      'calmesh_create_poll',
      'calmesh_decide_poll',
      'calmesh_delete_event',
      'calmesh_find_conflicts',
      'calmesh_get_event_details',
      'calmesh_get_events',
      'calmesh_get_poll_overlap',
      'calmesh_get_slots',
      'calmesh_list_bookings',
      'calmesh_list_calendars',
      'calmesh_list_connections',
      'calmesh_list_polls',
      'calmesh_manage_calendar',
      'calmesh_remove_connection',
      'calmesh_start_credential_connection',
      'calmesh_start_oauth_connection',
    ]);
  });

  it('every tool has a description', async () => {
    const result = await mcpClient.listTools();
    for (const tool of result.tools) {
      expect(tool.description, `${tool.name} should have a description`).toBeTruthy();
    }
  });

  it('every tool has an input schema', async () => {
    const result = await mcpClient.listTools();
    for (const tool of result.tools) {
      expect(tool.inputSchema, `${tool.name} should have an input schema`).toBeTruthy();
    }
  });
});
