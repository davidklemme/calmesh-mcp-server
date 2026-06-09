import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CalMeshClient } from './client.js';
import { registerCoreTools } from './tools/core.js';
import { registerBookingTools } from './tools/booking.js';
import { registerPollTools } from './tools/polls.js';
import { registerSetupTools } from './tools/setup.js';

declare const __VERSION__: string;

export function createServer(client: CalMeshClient): McpServer {
  const server = new McpServer({
    name: 'calmesh',
    version: typeof __VERSION__ !== 'undefined' ? __VERSION__ : '0.0.0-dev',
  });

  registerCoreTools(server, client);
  registerBookingTools(server, client);
  registerPollTools(server, client);
  registerSetupTools(server, client);

  return server;
}
