import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CalMeshClient, CalMeshApiError } from '../client.js';

describe('CalMeshClient', () => {
  let client: CalMeshClient;
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    client = new CalMeshClient('cm_live_abc123def456', 'https://calmesh.xyz');
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function errorResponse(status: number, code: string, message: string, details?: unknown): Response {
    return new Response(
      JSON.stringify({ error: { code, message, details } }),
      { status, headers: { 'Content-Type': 'application/json' } },
    );
  }

  it('sends correct Authorization header', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: 'test' }));
    await client.get('/api/v1/calendars');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://calmesh.xyz/api/v1/calendars',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer cm_live_abc123def456',
        }),
      }),
    );
  });

  it('parses successful JSON responses', async () => {
    const data = [{ name: 'Work', slug: 'work' }];
    mockFetch.mockResolvedValueOnce(jsonResponse(data));

    const result = await client.get('/api/v1/calendars');
    expect(result).toEqual(data);
  });

  it('appends query params for GET requests', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ events: [] }));
    await client.get('/api/v1/calendars/work/events', { from: '2025-01-01', to: '2025-01-31', limit: 10 });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('from=2025-01-01');
    expect(calledUrl).toContain('to=2025-01-31');
    expect(calledUrl).toContain('limit=10');
  });

  it('skips undefined query params', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ events: [] }));
    await client.get('/api/v1/calendars/work/events', { from: '2025-01-01', offset: undefined });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('from=2025-01-01');
    expect(calledUrl).not.toContain('offset');
  });

  it('throws CalMeshApiError with status 401', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(401, 'UNAUTHORIZED', 'Invalid API key'));

    const err = await client.get('/api/v1/calendars').catch((e) => e);
    expect(err).toBeInstanceOf(CalMeshApiError);
    expect(err.status).toBe(401);
    expect(err.suggestion).toBe(
      'Invalid or expired API key. Generate a new one at calmesh.xyz/dashboard/api-keys',
    );
  });

  it('throws CalMeshApiError with status 402', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(402, 'PAYMENT_REQUIRED', 'Subscription inactive'));

    const err = await client.get('/api/v1/calendars').catch((e) => e);
    expect(err).toBeInstanceOf(CalMeshApiError);
    expect(err.status).toBe(402);
    expect(err.suggestion).toContain('subscription is inactive');
  });

  it('throws CalMeshApiError with status 403 and scope info', async () => {
    mockFetch.mockResolvedValueOnce(
      errorResponse(403, 'FORBIDDEN', 'Insufficient scope', {
        requiredScope: 'book',
        currentScope: 'read',
      }),
    );

    const err = await client.post('/api/v1/bookings').catch((e) => e);
    expect(err).toBeInstanceOf(CalMeshApiError);
    expect(err.status).toBe(403);
    expect(err.suggestion).toContain("'book' scope");
    expect(err.suggestion).toContain("'read' scope");
  });

  it('throws CalMeshApiError with status 403 without scope info (generic fallback)', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(403, 'FORBIDDEN', 'Access denied'));

    const err = await client.post('/api/v1/bookings').catch((e) => e);
    expect(err).toBeInstanceOf(CalMeshApiError);
    expect(err.status).toBe(403);
    expect(err.suggestion).toContain('Insufficient permissions');
  });

  it('throws CalMeshApiError with status 404', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(404, 'NOT_FOUND', 'Calendar not found'));

    const err = await client.get('/api/v1/calendars/missing').catch((e) => e);
    expect(err).toBeInstanceOf(CalMeshApiError);
    expect(err.status).toBe(404);
  });

  it('throws CalMeshApiError with status 409', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(409, 'CONFLICT', 'Slot taken'));

    const err = await client.post('/api/v1/bookings').catch((e) => e);
    expect(err).toBeInstanceOf(CalMeshApiError);
    expect(err.status).toBe(409);
    expect(err.suggestion).toContain('no longer available');
  });

  it('throws CalMeshApiError with status 429', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(429, 'RATE_LIMITED', 'Rate limited'));

    const err = await client.get('/api/v1/calendars').catch((e) => e);
    expect(err).toBeInstanceOf(CalMeshApiError);
    expect(err.status).toBe(429);
    expect(err.suggestion).toContain('Rate limit');
  });

  it('handles non-JSON error responses', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    );

    const err = await client.get('/api/v1/calendars').catch((e) => e);
    expect(err).toBeInstanceOf(CalMeshApiError);
    expect(err.status).toBe(500);
    expect(err.code).toBe('HTTP_500');
  });

  it('times out after 30s and throws with code TIMEOUT', async () => {
    vi.useFakeTimers();

    mockFetch.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted', 'AbortError'));
          });
        }),
    );

    const promise = client.get('/api/v1/calendars');
    vi.advanceTimersByTime(30_000);

    const err = await promise.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CalMeshApiError);
    expect((err as CalMeshApiError).code).toBe('TIMEOUT');
    expect((err as CalMeshApiError).suggestion).toContain('timed out');

    vi.useRealTimers();
  });

  it('throws with code NETWORK_ERROR on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

    const err = await client.get('/api/v1/calendars').catch((e) => e);
    expect(err).toBeInstanceOf(CalMeshApiError);
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.suggestion).toContain('calmesh.xyz');
  });

  it('sends POST body as JSON', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: '123' }, 201));

    await client.post('/api/v1/calendars', { name: 'Work', timezone: 'UTC' });

    const [, options] = mockFetch.mock.calls[0];
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ name: 'Work', timezone: 'UTC' });
  });

  it('sends PATCH body as JSON', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: '123' }));

    await client.patch('/api/v1/calendars/work', { name: 'Updated' });

    const [, options] = mockFetch.mock.calls[0];
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body)).toEqual({ name: 'Updated' });
  });

  it('handles DELETE requests', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await client.del('/api/v1/connections/123');

    const [, options] = mockFetch.mock.calls[0];
    expect(options.method).toBe('DELETE');
  });
});
