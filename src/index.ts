import { parseArgs } from 'node:util';
import { createServer as createHttpServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CalMeshClient } from './client.js';
import { createServer } from './server.js';

declare const __VERSION__: string;

const HELP_TEXT = `CalMesh MCP Server v${typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev'}

Usage: calmesh-mcp [options]

Options:
  --api-key <key>       CalMesh API key (prefer CALMESH_API_KEY env var)
  --base-url <url>      CalMesh API base URL (default: https://calmesh.xyz)
  --transport <type>    Transport: stdio (default) or http
  --port <port>         HTTP port (default: 3100)
  --host <host>         HTTP host (default: 127.0.0.1)
  --http-secret <token> Required for HTTP transport authentication
  --help                Show this help message
  --version             Show version

Environment Variables:
  CALMESH_API_KEY       API key (recommended over --api-key flag)
  CALMESH_BASE_URL      API base URL
  CALMESH_HTTP_SECRET   HTTP transport secret

Example Claude Desktop config:
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
`;

function verifyBearerToken(header: string | undefined, secret: string): boolean {
  const expected = `Bearer ${secret}`;
  if (!header || header.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      'api-key': { type: 'string' },
      'base-url': { type: 'string' },
      transport: { type: 'string', default: 'stdio' },
      port: { type: 'string', default: '3100' },
      host: { type: 'string', default: '127.0.0.1' },
      'http-secret': { type: 'string' },
      help: { type: 'boolean', default: false },
      version: { type: 'boolean', default: false },
    },
    strict: true,
  });

  if (values.help) {
    process.stderr.write(HELP_TEXT);
    process.exit(0);
  }

  if (values.version) {
    process.stderr.write(`${typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev'}\n`);
    process.exit(0);
  }

  // Resolve API key
  const apiKey = values['api-key'] ?? process.env.CALMESH_API_KEY;
  if (!apiKey) {
    process.stderr.write(
      'Error: No API key provided. Set CALMESH_API_KEY environment variable or use --api-key flag.\n',
    );
    process.exit(1);
  }

  if (values['api-key']) {
    process.stderr.write(
      'Warning: API keys passed via CLI flags are visible in process listings. Prefer CALMESH_API_KEY env var.\n',
    );
  }

  // Resolve and validate base URL
  const baseUrl = values['base-url'] ?? process.env.CALMESH_BASE_URL ?? 'https://calmesh.xyz';
  if (!baseUrl.startsWith('https://') && !baseUrl.match(/^http:\/\/localhost(:\d+)?(\/|$)/)) {
    process.stderr.write('Error: Base URL must use HTTPS (except http://localhost for local dev).\n');
    process.exit(1);
  }

  if (!baseUrl.includes('calmesh.xyz') && !baseUrl.match(/^http:\/\/localhost(:\d+)?(\/|$)/)) {
    process.stderr.write(`Warning: Base URL domain is not calmesh.xyz: ${baseUrl}\n`);
  }

  const transport = values.transport ?? 'stdio';

  if (transport !== 'stdio' && transport !== 'http') {
    process.stderr.write('Error: Transport must be "stdio" or "http".\n');
    process.exit(1);
  }

  // HTTP transport requires --http-secret
  const httpSecret = values['http-secret'] ?? process.env.CALMESH_HTTP_SECRET;
  if (transport === 'http' && !httpSecret) {
    process.stderr.write(
      'Error: HTTP transport requires --http-secret or CALMESH_HTTP_SECRET env var for authentication.\n',
    );
    process.exit(1);
  }

  const client = new CalMeshClient(apiKey, baseUrl);
  const mcpServer = createServer(client);

  if (transport === 'stdio') {
    await startStdio(mcpServer);
  } else {
    const port = parseInt(values.port ?? '3100', 10);
    const host = values.host ?? '127.0.0.1';
    await startHttp(mcpServer, port, host, httpSecret!);
  }
}

async function startStdio(mcpServer: ReturnType<typeof createServer>): Promise<void> {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  process.stderr.write('CalMesh MCP server running (transport: stdio)\n');

  const shutdown = async () => {
    try {
      await mcpServer.close();
    } catch {
      // best-effort
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function startHttp(
  mcpServer: ReturnType<typeof createServer>,
  port: number,
  host: string,
  httpSecret: string,
): Promise<void> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });

  await mcpServer.connect(transport);

  const httpServer = createHttpServer(async (req, res) => {
    if (!verifyBearerToken(req.headers.authorization, httpSecret)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    await transport.handleRequest(req, res);
  });

  httpServer.listen(port, host, () => {
    process.stderr.write(`CalMesh MCP server running (transport: http, ${host}:${port})\n`);
  });

  const shutdown = async () => {
    try {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
      await mcpServer.close();
    } catch {
      // best-effort
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
