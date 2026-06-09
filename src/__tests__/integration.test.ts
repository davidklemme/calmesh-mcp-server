import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const CLI_PATH = resolve(import.meta.dirname, '../../dist/index.js');

function sendJsonRpc(proc: ReturnType<typeof spawn>, request: object): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout waiting for response')), 10_000);

    let buffer = '';
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString();
      // JSON-RPC messages are newline-delimited
      const lines = buffer.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          clearTimeout(timeout);
          proc.stdout?.removeListener('data', onData);
          resolve(parsed);
          return;
        } catch {
          // incomplete JSON, continue buffering
        }
      }
    };

    proc.stdout?.on('data', onData);
    proc.stdin?.write(JSON.stringify(request) + '\n');
  });
}

describe('MCP Server Integration', () => {
  it('lists 19 tools via stdio transport', async () => {
    const proc = spawn('node', [CLI_PATH], {
      env: { ...process.env, CALMESH_API_KEY: 'cm_live_test_integration' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    try {
      // Initialize
      const initResponse = (await sendJsonRpc(proc, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      })) as { result?: { serverInfo?: { name: string } } };

      expect(initResponse.result?.serverInfo?.name).toBe('calmesh');

      // Send initialized notification
      proc.stdin?.write(
        JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n',
      );

      // List tools
      const toolsResponse = (await sendJsonRpc(proc, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      })) as { result?: { tools: Array<{ name: string; description: string }> } };

      const tools = toolsResponse.result?.tools ?? [];
      expect(tools).toHaveLength(22);

      const toolNames = tools.map((t) => t.name).sort();
      expect(toolNames).toContain('calmesh_list_calendars');
      expect(toolNames).toContain('calmesh_create_booking');
      expect(toolNames).toContain('calmesh_create_poll');
      expect(toolNames).toContain('calmesh_start_oauth_connection');
    } finally {
      proc.kill('SIGTERM');
    }
  });
});
