import type { ApiError } from './types.js';

export class CalMeshApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly suggestion: string,
  ) {
    super(message);
    this.name = 'CalMeshApiError';
  }
}

function redactApiKey(key: string): string {
  if (key.startsWith('cm_live_') && key.length > 12) {
    return 'cm_live_****';
  }
  return '****';
}

function getSuggestion(status: number, body: ApiError | null): string {
  switch (status) {
    case 401:
      return 'Invalid or expired API key. Generate a new one at calmesh.xyz/dashboard/api-keys';
    case 402:
      return 'Your subscription is inactive. Visit calmesh.xyz/dashboard/billing to subscribe.';
    case 403: {
      if (body?.error?.details && typeof body.error.details === 'object') {
        const details = body.error.details as Record<string, string>;
        if (details.requiredScope && details.currentScope) {
          return `This action requires a '${details.requiredScope}' scope API key. Your current key has '${details.currentScope}' scope.`;
        }
      }
      return 'Insufficient permissions for this action. Check your API key scope at calmesh.xyz/dashboard/api-keys';
    }
    case 409:
      return 'This time slot is no longer available. Use calmesh_get_slots to see current availability.';
    case 429:
      return 'Rate limit exceeded. Please wait before trying again.';
    case 503:
      return 'This feature is not available on this instance.';
    default:
      return `Request failed with status ${status}.`;
  }
}

export class CalMeshClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, baseUrl: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return this.request<T>('GET', url.toString());
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', `${this.baseUrl}${path}`, body);
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', `${this.baseUrl}${path}`, body);
  }

  async del(path: string, body?: unknown): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.apiKey}`,
      };
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }

      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'DELETE',
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }
    } catch (error) {
      this.handleFetchError(error);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.apiKey}`,
      };
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }

      const response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      this.handleFetchError(error);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    let body: ApiError | null = null;
    try {
      body = (await response.json()) as ApiError;
    } catch {
      // non-JSON error response
    }

    const message = body?.error?.message ?? `HTTP ${response.status}`;
    const code = body?.error?.code ?? `HTTP_${response.status}`;
    const suggestion = getSuggestion(response.status, body);

    throw new CalMeshApiError(message, response.status, code, suggestion);
  }

  private handleFetchError(error: unknown): never {
    if (error instanceof CalMeshApiError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new CalMeshApiError(
        'Request timed out',
        0,
        'TIMEOUT',
        'CalMesh API request timed out. Try again or check service status.',
      );
    }

    if (error instanceof TypeError) {
      throw new CalMeshApiError(
        'Network error',
        0,
        'NETWORK_ERROR',
        `Unable to reach CalMesh API at ${this.baseUrl}. Check your network connection and base URL.`,
      );
    }

    throw new CalMeshApiError(
      String(error),
      0,
      'UNKNOWN_ERROR',
      `An unexpected error occurred. API key: ${redactApiKey(this.apiKey)}`,
    );
  }
}
