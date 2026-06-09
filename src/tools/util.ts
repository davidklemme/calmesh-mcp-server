import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { CalMeshApiError } from '../client.js';

export function toolResult(data: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

export function toolError(error: unknown): CallToolResult {
  if (error instanceof CalMeshApiError) {
    return {
      content: [
        {
          type: 'text',
          text: `[${error.code}] ${error.message}\n\n${error.suggestion}`,
        },
      ],
      isError: true,
    };
  }

  return {
    content: [{ type: 'text', text: `Unexpected error: ${String(error)}` }],
    isError: true,
  };
}
