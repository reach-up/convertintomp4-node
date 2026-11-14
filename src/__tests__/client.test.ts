import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import {
  ConvertIntoMP4Client,
  ConvertIntoMP4Error,
  ApiError,
  AuthenticationError,
  RateLimitError,
  TimeoutError,
} from '../client.js';
import { createHmac } from 'node:crypto';
import { verifyJobWebhook } from '../webhooks.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_API_KEY = 'ck_test_1234567890';

function createClient(overrides: Record<string, unknown> = {}) {
  return new ConvertIntoMP4Client({ apiKey: TEST_API_KEY, ...overrides });
}

/** Build a minimal Response-like object that `fetch` would return. */
function mockResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
) {
  const status = init.status ?? 200;
  const headers = new Headers(init.headers ?? {});

  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    json: vi.fn().mockResolvedValue(body),
    body: null,
  } as unknown as Response;
}

/** Convenience: wrap data in the standard API envelope. */
function okEnvelope<T>(data: T) {
  return { success: true, data };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.restoreAllMocks();
  global.fetch = vi.fn();
});

// =========================================================================
// 1. Initialization
// =========================================================================

describe('Initialization', () => {
  it('throws if no API key provided', () => {
    expect(() => new ConvertIntoMP4Client({ apiKey: '' })).toThrow(ConvertIntoMP4Error);
    expect(() => new ConvertIntoMP4Client({ apiKey: '' })).toThrow('API key is required');
  });

  it('uses default base URL', async () => {
    const client = createClient();
    (global.fetch as Mock).mockResolvedValue(mockResponse(okEnvelope([])));

    await client.listFormats();

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('https://api.convertintomp4.com/v1/formats'),
      expect.anything(),
    );
  });

  it('sends X-Sandbox header on the normal API host when sandbox: true', async () => {
    const client = createClient({ sandbox: true });
    (global.fetch as Mock).mockResolvedValue(mockResponse(okEnvelope([])));

    await client.listFormats();

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('https://api.convertintomp4.com/v1/formats'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Sandbox': 'true' }),
      }),
    );
  });

  it('uses custom base URL when provided', async () => {
    const client = createClient({ baseUrl: 'https://custom.example.com/v1' });
    (global.fetch as Mock).mockResolvedValue(mockResponse(okEnvelope([])));

    await client.listFormats();

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('https://custom.example.com/v1/formats'),
      expect.anything(),
    );
  });

  it('uses custom timeout when provided', async () => {
    const client = createClient({ timeout: 5000 });
    // Trigger a request so we can verify the abort controller fires after the custom timeout
    // We won't actually wait 5s — just verify the client was constructed without error
    // and that it passes the signal to fetch
    (global.fetch as Mock).mockResolvedValue(mockResponse(okEnvelope([])));

    await client.listFormats();

    const fetchCall = (global.fetch as Mock).mock.calls[0];
    expect(fetchCall[1].signal).toBeInstanceOf(AbortSignal);
  });
});

// =========================================================================
// 2. Auth Headers
// =========================================================================

describe('Auth Headers', () => {
  it('sends Bearer token with API key', async () => {
    const client = createClient();
    (global.fetch as Mock).mockResolvedValue(mockResponse(okEnvelope([])));

    await client.listFormats();

    const headers = (global.fetch as Mock).mock.calls[0][1].headers;
    expect(headers['Authorization']).toBe(`Bearer ${TEST_API_KEY}`);
  });

  it('sends Content-Type application/json', async () => {
    const client = createClient();
    (global.fetch as Mock).mockResolvedValue(mockResponse(okEnvelope([])));

    await client.listFormats();

    const headers = (global.fetch as Mock).mock.calls[0][1].headers;
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('sends User-Agent header', async () => {
    const client = createClient();
    (global.fetch as Mock).mockResolvedValue(mockResponse(okEnvelope([])));

    await client.listFormats();

    const headers = (global.fetch as Mock).mock.calls[0][1].headers;
    expect(headers['User-Agent']).toBe('convertintomp4-node/1.2.0');
  });
});

// =========================================================================
// 3. Request Building
// =========================================================================

describe('Request Building', () => {
  it('createJob: POST /jobs with body', async () => {
    const client = createClient();
    const jobPayload = {
      tasks: {
        'import-file': { operation: 'import/url' as const, url: 'https://example.com/file.mp4' },
        convert: { operation: 'convert' as const, input: 'import-file', output_format: 'webm' },
      },
    };
    const fakeJob = { id: 'job_1', status: 'pending', tasks: {} };
    (global.fetch as Mock).mockResolvedValue(mockResponse(okEnvelope(fakeJob)));

    await client.createJob(jobPayload);

    const [url, opts] = (global.fetch as Mock).mock.calls[0];
    expect(url).toBe('https://api.convertintomp4.com/v1/jobs');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual(jobPayload);
  });

  it('getJob: GET /jobs/:id', async () => {
    const client = createClient();
    const fakeJob = { id: 'job_42', status: 'completed', tasks: {} };
    (global.fetch as Mock).mockResolvedValue(mockResponse(okEnvelope(fakeJob)));

    await client.getJob('job_42');

    const [url, opts] = (global.fetch as Mock).mock.calls[0];
    expect(url).toBe('https://api.convertintomp4.com/v1/jobs/job_42');
    expect(opts.method).toBe('GET');
  });

  it('listJobs: GET /jobs with no query params when none provided', async () => {
    const client = createClient();
    (global.fetch as Mock).mockResolvedValue(
      mockResponse({ success: true, data: [], meta: { total: 0, limit: 25, offset: 0 } }),
    );

    await client.listJobs();

    const [url] = (global.fetch as Mock).mock.calls[0];
    expect(url).toBe('https://api.convertintomp4.com/v1/jobs');
  });

  it('listJobs: builds query string from status/tag/limit/offset params', async () => {
    const client = createClient();
    (global.fetch as Mock).mockResolvedValue(
      mockResponse({ success: true, data: [], meta: { total: 0, limit: 10, offset: 5 } }),
    );

    await client.listJobs({ status: 'completed', tag: 'batch-1', limit: 10, offset: 5 });

    const [url] = (global.fetch as Mock).mock.calls[0];
    expect(url).toContain('status=completed');
    expect(url).toContain('tag=batch-1');
    expect(url).toContain('limit=10');
    expect(url).toContain('offset=5');
  });

  it('deleteJob: DELETE /jobs/:id', async () => {
    const client = createClient();
    (global.fetch as Mock).mockResolvedValue(mockResponse(undefined, { status: 204 }));

    await client.deleteJob('job_99');

    const [url, opts] = (global.fetch as Mock).mock.calls[0];
    expect(url).toBe('https://api.convertintomp4.com/v1/jobs/job_99');
    expect(opts.method).toBe('DELETE');
  });

  it('cancelJob: POST /jobs/:id/cancel', async () => {
    const client = createClient();
    const fakeJob = { id: 'job_7', status: 'cancelled', tasks: {} };
    (global.fetch as Mock).mockResolvedValue(mockResponse(okEnvelope(fakeJob)));

    await client.cancelJob('job_7');

    const [url, opts] = (global.fetch as Mock).mock.calls[0];
    expect(url).toBe('https://api.convertintomp4.com/v1/jobs/job_7/cancel');
    expect(opts.method).toBe('POST');
  });

  it('retryJob: POST /jobs/:id/retry', async () => {
    const client = createClient();
    const fakeJob = { id: 'job_7', status: 'pending', tasks: {} };
    (global.fetch as Mock).mockResolvedValue(mockResponse(okEnvelope(fakeJob)));

    await client.retryJob('job_7');

    const [url, opts] = (global.fetch as Mock).mock.calls[0];
    expect(url).toBe('https://api.convertintomp4.com/v1/jobs/job_7/retry');
    expect(opts.method).toBe('POST');
  });

  it('listFormats: GET /formats', async () => {
    const client = createClient();
    (global.fetch as Mock).mockResolvedValue(mockResponse(okEnvelope([])));

    await client.listFormats();

    const [url, opts] = (global.fetch as Mock).mock.calls[0];
    expect(url).toBe('https://api.convertintomp4.com/v1/formats');
    expect(opts.method).toBe('GET');
  });

  it('listFormats with category: GET /formats?category=video', async () => {
    const client = createClient();
    (global.fetch as Mock).mockResolvedValue(mockResponse(okEnvelope([])));

    await client.listFormats('video');

    const [url] = (global.fetch as Mock).mock.calls[0];
    expect(url).toBe('https://api.convertintomp4.com/v1/formats?category=video');
  });

  it('getFormat: GET /formats/:id', async () => {
    const client = createClient();
    const fakeFormat = { id: 'mp4', name: 'MP4', category: 'video', extension: 'mp4', mime_types: ['video/mp4'] };
    (global.fetch as Mock).mockResolvedValue(mockResponse(okEnvelope(fakeFormat)));

    await client.getFormat('mp4');

    const [url, opts] = (global.fetch as Mock).mock.calls[0];
    expect(url).toBe('https://api.convertintomp4.com/v1/formats/mp4');
    expect(opts.method).toBe('GET');
  });

  it('getFormatOptions: GET /formats/options?input_format=X&output_format=Y', async () => {
    const client = createClient();
    const fakeOptions = { input_format: 'mp4', output_format: 'webm', options: [] };
    (global.fetch as Mock).mockResolvedValue(mockResponse(okEnvelope(fakeOptions)));

    await client.getFormatOptions('mp4', 'webm');

    const [url, opts] = (global.fetch as Mock).mock.calls[0];
    expect(url).toContain('/formats/options?');
    expect(url).toContain('input_format=mp4');
    expect(url).toContain('output_format=webm');
    expect(opts.method).toBe('GET');
  });

  it('createWebhook: POST /webhooks with url+events', async () => {
    const client = createClient();
    const fakeWebhook = { id: 'wh_1', url: 'https://example.com/hook', events: ['job.completed'], active: true, created_at: '2026-01-01' };
    (global.fetch as Mock).mockResolvedValue(mockResponse(okEnvelope(fakeWebhook)));

    await client.createWebhook('https://example.com/hook', ['job.completed']);

    const [url, opts] = (global.fetch as Mock).mock.calls[0];
    expect(url).toBe('https://api.convertintomp4.com/v1/webhooks');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.url).toBe('https://example.com/hook');
    expect(body.events).toEqual(['job.completed']);
  });

  it('listWebhooks: GET /webhooks', async () => {
    const client = createClient();
    (global.fetch as Mock).mockResolvedValue(mockResponse(okEnvelope([])));

    await client.listWebhooks();

    const [url, opts] = (global.fetch as Mock).mock.calls[0];
    expect(url).toBe('https://api.convertintomp4.com/v1/webhooks');
    expect(opts.method).toBe('GET');
  });

  it('getWebhook: GET /webhooks/:id', async () => {
    const client = createClient();
    const fakeWebhook = { id: 'wh_5', url: 'https://example.com', events: [], active: true, created_at: '2026-01-01' };
    (global.fetch as Mock).mockResolvedValue(mockResponse(okEnvelope(fakeWebhook)));

    await client.getWebhook('wh_5');

    const [url, opts] = (global.fetch as Mock).mock.calls[0];
    expect(url).toBe('https://api.convertintomp4.com/v1/webhooks/wh_5');
    expect(opts.method).toBe('GET');
  });

  it('deleteWebhook: DELETE /webhooks/:id', async () => {
    const client = createClient();
    (global.fetch as Mock).mockResolvedValue(mockResponse(undefined, { status: 204 }));

    await client.deleteWebhook('wh_5');

    const [url, opts] = (global.fetch as Mock).mock.calls[0];
    expect(url).toBe('https://api.convertintomp4.com/v1/webhooks/wh_5');
    expect(opts.method).toBe('DELETE');
  });
});

// =========================================================================
// 4. Response Parsing
// =========================================================================

describe('Response Parsing', () => {
  it('unwraps successful response data from { data: ... }', async () => {
    const client = createClient();
    const formats = [{ id: 'mp4', name: 'MP4', category: 'video', extension: 'mp4', mime_types: ['video/mp4'] }];
    (global.fetch as Mock).mockResolvedValue(mockResponse(okEnvelope(formats)));

    const result = await client.listFormats();

    expect(result).toEqual(formats);
  });

  it('returns undefined for 204 No Content', async () => {
    const client = createClient();
    (global.fetch as Mock).mockResolvedValue(mockResponse(undefined, { status: 204 }));

    const result = await client.deleteJob('job_1');

    expect(result).toBeUndefined();
  });

  it('throws AuthenticationError for 401', async () => {
    const client = createClient();
    (global.fetch as Mock).mockResolvedValue(
      mockResponse(
        { success: false, error: { code: 'AUTHENTICATION_ERROR', message: 'Invalid API key' } },
        { status: 401 },
      ),
    );

    await expect(client.listFormats()).rejects.toThrow(AuthenticationError);
    await expect(
      // Reset mock for second call
      (() => {
        (global.fetch as Mock).mockResolvedValue(
          mockResponse(
            { success: false, error: { code: 'AUTHENTICATION_ERROR', message: 'Invalid API key' } },
            { status: 401 },
          ),
        );
        return client.listFormats();
      })(),
    ).rejects.toThrow('Invalid API key');
  });

  it('throws RateLimitError for 429', async () => {
    const client = createClient();
    (global.fetch as Mock).mockResolvedValue(
      mockResponse(
        { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded' } },
        { status: 429 },
      ),
    );

    await expect(client.listFormats()).rejects.toThrow(RateLimitError);
  });

  it('throws RateLimitError with retryAfter from header', async () => {
    const client = createClient();
    (global.fetch as Mock).mockResolvedValue(
      mockResponse(
        { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded' } },
        { status: 429, headers: { 'Retry-After': '30' } },
      ),
    );

    try {
      await client.listFormats();
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitError);
      expect((err as RateLimitError).retryAfter).toBe(30);
    }
  });

  it('throws ApiError for 500 with code and message', async () => {
    const client = createClient();
    (global.fetch as Mock).mockResolvedValue(
      mockResponse(
        { success: false, error: { code: 'INTERNAL_ERROR', message: 'Something broke' } },
        { status: 500 },
      ),
    );

    try {
      await client.listFormats();
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).statusCode).toBe(500);
      expect((err as ApiError).code).toBe('INTERNAL_ERROR');
      expect((err as ApiError).message).toBe('Something broke');
    }
  });

  it('throws ApiError for other error status codes (e.g. 400)', async () => {
    const client = createClient();
    (global.fetch as Mock).mockResolvedValue(
      mockResponse(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Bad request', details: { field: 'tasks' } } },
        { status: 400 },
      ),
    );

    try {
      await client.createJob({ tasks: {} as never });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).statusCode).toBe(400);
      expect((err as ApiError).code).toBe('VALIDATION_ERROR');
      expect((err as ApiError).details).toEqual({ field: 'tasks' });
    }
  });

  it('throws ConvertIntoMP4Error for network failures', async () => {
    const client = createClient();
    (global.fetch as Mock).mockRejectedValue(new TypeError('fetch failed'));

    await expect(client.listFormats()).rejects.toThrow(ConvertIntoMP4Error);
    // Reset and check message
    (global.fetch as Mock).mockRejectedValue(new TypeError('fetch failed'));
    await expect(client.listFormats()).rejects.toThrow('Request failed: fetch failed');
  });
});

// =========================================================================
// 5. File Upload
// =========================================================================

describe('File Upload', () => {
  it('convert() sends multipart FormData with file and targetFormat', async () => {
    const client = createClient();
    const fakeResult = { jobId: 'j_1', status: 'processing', statusUrl: '/jobs/j_1' };
    (global.fetch as Mock).mockResolvedValue(mockResponse(fakeResult));

    const file = new Blob(['hello'], { type: 'text/plain' });
    await client.convert(file, 'pdf', { filename: 'notes.docx' });

    const [url, opts] = (global.fetch as Mock).mock.calls[0];
    expect(url).toBe('https://api.convertintomp4.com/v1/convert');
    expect(opts.method).toBe('POST');
    expect(opts.body).toBeInstanceOf(FormData);

    const formData = opts.body as FormData;
    expect(formData.get('targetFormat')).toBe('pdf');
    expect(formData.get('file')).toBeInstanceOf(Blob);
  });

  it('convert() includes additional options as fields', async () => {
    const client = createClient();
    const fakeResult = { jobId: 'j_2', status: 'processing', statusUrl: '/jobs/j_2' };
    (global.fetch as Mock).mockResolvedValue(mockResponse(fakeResult));

    const file = new Blob(['data'], { type: 'video/mp4' });
    await client.convert(file, 'webm', { filename: 'in.mp4', quality: 'high', fps: 30 });

    const formData = (global.fetch as Mock).mock.calls[0][1].body as FormData;
    expect(formData.get('quality')).toBe('high');
    expect(formData.get('fps')).toBe('30');
  });

  it('uploadFile() delegates to convert()', async () => {
    const client = createClient();
    const fakeResult = { jobId: 'j_3', status: 'processing', statusUrl: '/jobs/j_3' };
    (global.fetch as Mock).mockResolvedValue(mockResponse(fakeResult));

    const file = new Blob(['data']);
    const result = await client.uploadFile(file, 'png', { filename: 'src.webp' });

    expect(result).toEqual(fakeResult);
    const formData = (global.fetch as Mock).mock.calls[0][1].body as FormData;
    expect(formData.get('targetFormat')).toBe('png');
  });

  it('handles Buffer input by converting to Blob', async () => {
    const client = createClient();
    const fakeResult = { jobId: 'j_4', status: 'processing', statusUrl: '/jobs/j_4' };
    (global.fetch as Mock).mockResolvedValue(mockResponse(fakeResult));

    const buf = Buffer.from('file contents');
    await client.convert(buf, 'jpg', { filename: 'photo.png' });

    const formData = (global.fetch as Mock).mock.calls[0][1].body as FormData;
    const uploadedFile = formData.get('file');
    expect(uploadedFile).toBeInstanceOf(Blob);
  });

  // The API derives sourceFormat from the multipart filename extension, so the
  // old hardcoded 'upload' made every quick-convert 400 with
  // UNSUPPORTED_CONVERSION ("Cannot convert  to MP4"). Reproduced against
  // production 2026-07-26 before the fix.
  it('convert() sends the real filename so the API can read the source format', async () => {
    const client = createClient();
    (global.fetch as Mock).mockResolvedValue(
      mockResponse({ jobId: 'j_f', status: 'queued', statusUrl: '/v1/status/j_f' }),
    );

    await client.convert(new Blob(['data']), 'mp4', { filename: 'clip.mov' });

    const formData = (global.fetch as Mock).mock.calls[0][1].body as FormData;
    expect((formData.get('file') as File).name).toBe('clip.mov');
    // filename is an SDK-side hint, never a conversion field
    expect(formData.get('filename')).toBeNull();
  });

  it('convert() inherits the name from a File input', async () => {
    const client = createClient();
    (global.fetch as Mock).mockResolvedValue(
      mockResponse({ jobId: 'j_g', status: 'queued', statusUrl: '/v1/status/j_g' }),
    );

    await client.convert(new File(['data'], 'photo.heic'), 'jpg');

    const formData = (global.fetch as Mock).mock.calls[0][1].body as FormData;
    expect((formData.get('file') as File).name).toBe('photo.heic');
  });

  it('convert() throws locally when no filename with an extension is available', async () => {
    const client = createClient();
    (global.fetch as Mock).mockResolvedValue(mockResponse({}));

    await expect(client.convert(Buffer.from('x'), 'mp4')).rejects.toThrow(
      ConvertIntoMP4Error,
    );
    await expect(
      client.convert(Buffer.from('x'), 'mp4', { filename: 'noextension' }),
    ).rejects.toThrow(/source filename with its extension/);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// =========================================================================
// 6. Job Polling
// =========================================================================

describe('Job Polling', () => {
  it('waitForJob resolves when job status is completed', async () => {
    const client = createClient();
    const completedJob = { id: 'job_1', status: 'completed', tasks: {}, created_at: '2026-01-01' };

    (global.fetch as Mock).mockResolvedValue(mockResponse(okEnvelope(completedJob)));

    const result = await client.waitForJob('job_1', { interval: 10 });

    expect(result.status).toBe('completed');
  });

  it('waitForJob resolves when job status is failed', async () => {
    const client = createClient();
    const failedJob = { id: 'job_2', status: 'failed', tasks: {}, created_at: '2026-01-01' };

    (global.fetch as Mock).mockResolvedValue(mockResponse(okEnvelope(failedJob)));

    const result = await client.waitForJob('job_2', { interval: 10 });

    expect(result.status).toBe('failed');
  });

  it('waitForJob resolves when job status is cancelled', async () => {
    const client = createClient();
    const cancelledJob = { id: 'job_3', status: 'cancelled', tasks: {}, created_at: '2026-01-01' };

    (global.fetch as Mock).mockResolvedValue(mockResponse(okEnvelope(cancelledJob)));

    const result = await client.waitForJob('job_3', { interval: 10 });

    expect(result.status).toBe('cancelled');
  });

  it('waitForJob throws TimeoutError after timeout', async () => {
    const client = createClient();
    const pendingJob = { id: 'job_4', status: 'processing', tasks: {}, created_at: '2026-01-01' };

    (global.fetch as Mock).mockResolvedValue(mockResponse(okEnvelope(pendingJob)));

    // Use a very short timeout so the test completes quickly
    await expect(
      client.waitForJob('job_4', { interval: 10, timeout: 50 }),
    ).rejects.toThrow(TimeoutError);

    await expect(
      (() => {
        (global.fetch as Mock).mockResolvedValue(mockResponse(okEnvelope(pendingJob)));
        return client.waitForJob('job_4', { interval: 10, timeout: 50 });
      })(),
    ).rejects.toThrow('did not complete within');
  });

  it('waitForJob uses custom interval', async () => {
    const client = createClient();
    let callCount = 0;

    (global.fetch as Mock).mockImplementation(() => {
      callCount++;
      if (callCount >= 3) {
        return Promise.resolve(
          mockResponse(okEnvelope({ id: 'job_5', status: 'completed', tasks: {}, created_at: '2026-01-01' })),
        );
      }
      return Promise.resolve(
        mockResponse(okEnvelope({ id: 'job_5', status: 'processing', tasks: {}, created_at: '2026-01-01' })),
      );
    });

    const start = Date.now();
    const result = await client.waitForJob('job_5', { interval: 50, timeout: 5000 });
    const elapsed = Date.now() - start;

    expect(result.status).toBe('completed');
    // With interval=50 and 2 poll iterations before success, elapsed should be ~100ms
    expect(elapsed).toBeGreaterThanOrEqual(80);
    expect(callCount).toBe(3);
  });

  // Quick-convert jobIds are bare 12-char nanoids and NEVER enter the Jobs API
  // Redis store, so GET /v1/jobs/{id} 404s forever (verified in production
  // 2026-07-26). They must be polled at GET /v1/status/{id}.
  it('waitForJob polls /status for quick-convert job ids', async () => {
    const client = createClient();
    (global.fetch as Mock).mockResolvedValue(
      mockResponse({
        jobId: 'x8Rb1ABEPT2t',
        status: 'completed',
        progress: 100,
        targetFormat: 'mp4',
        createdAt: '2026-07-26T12:00:52.652Z',
        result: {
          downloadUrl: '/v1/download/x8Rb1ABEPT2t',
          outputSize: 30368,
          outputFormat: 'mp4',
        },
      }),
    );

    const job = await client.waitForJob('x8Rb1ABEPT2t', { interval: 10 });

    expect((global.fetch as Mock).mock.calls[0][0]).toBe(
      'https://api.convertintomp4.com/v1/status/x8Rb1ABEPT2t',
    );
    expect(job.status).toBe('completed');
    expect(job.tasks.convert.result?.url).toBe(
      'https://api.convertintomp4.com/v1/download/x8Rb1ABEPT2t',
    );
  });

  it('waitForJob keeps using /jobs for pipeline job ids', async () => {
    const client = createClient();
    (global.fetch as Mock).mockResolvedValue(
      mockResponse(okEnvelope({ id: 'job_x', status: 'completed', tasks: {}, created_at: '2026-01-01' })),
    );

    await client.waitForJob('job_x', { interval: 10 });

    expect((global.fetch as Mock).mock.calls[0][0]).toBe(
      'https://api.convertintomp4.com/v1/jobs/job_x',
    );
  });

  it('waitForJob maps a queued /status payload to a non-terminal state', async () => {
    const client = createClient();
    (global.fetch as Mock).mockResolvedValue(
      mockResponse({ jobId: 'abc123456789', status: 'waiting', progress: 0 }),
    );

    await expect(
      client.waitForJob('abc123456789', { interval: 10, timeout: 50 }),
    ).rejects.toThrow(TimeoutError);
  });

  it('getConversionStatus surfaces a 404 as an ApiError', async () => {
    const client = createClient();
    (global.fetch as Mock).mockResolvedValue(
      mockResponse(
        { error: { code: 'JOB_NOT_FOUND', message: 'Job not found' } },
        { status: 404 },
      ),
    );

    await expect(client.getConversionStatus('nope')).rejects.toThrow(ApiError);
  });
});

// =========================================================================
// 7. SSE Streaming
// =========================================================================

describe('SSE Streaming', () => {
  /** Helper to create a readable stream from SSE text chunks. */
  function createSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    let index = 0;

    return new ReadableStream({
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(encoder.encode(chunks[index]));
          index++;
        } else {
          controller.close();
        }
      },
    });
  }

  function mockSSEResponse(chunks: string[], status = 200) {
    const body = createSSEStream(chunks);
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
      body,
    } as unknown as Response;
  }

  it('streamJobUpdates yields parsed events', async () => {
    const client = createClient();
    const sseData = [
      'event: progress\ndata: {"type":"progress","jobId":"j1","timestamp":"2026-01-01","progress":50}\n\n',
    ];

    (global.fetch as Mock).mockResolvedValue(mockSSEResponse(sseData));

    const updates = [];
    for await (const update of client.streamJobUpdates('j1')) {
      updates.push(update);
    }

    expect(updates).toHaveLength(1);
    expect(updates[0].type).toBe('progress');
    expect(updates[0].progress).toBe(50);
    expect(updates[0].jobId).toBe('j1');
  });

  it('streamJobUpdates auto-closes on completed event', async () => {
    const client = createClient();
    const sseData = [
      'event: progress\ndata: {"type":"progress","jobId":"j2","timestamp":"2026-01-01","progress":80}\n\n',
      'event: completed\ndata: {"type":"completed","jobId":"j2","timestamp":"2026-01-01","outputUrl":"https://r2.example.com/out.webm"}\n\n',
      // This should never be reached
      'event: progress\ndata: {"type":"progress","jobId":"j2","timestamp":"2026-01-01","progress":100}\n\n',
    ];

    (global.fetch as Mock).mockResolvedValue(mockSSEResponse(sseData));

    const updates = [];
    for await (const update of client.streamJobUpdates('j2')) {
      updates.push(update);
    }

    expect(updates).toHaveLength(2);
    expect(updates[0].type).toBe('progress');
    expect(updates[1].type).toBe('completed');
  });

  it('streamJobUpdates auto-closes on failed event', async () => {
    const client = createClient();
    const sseData = [
      'event: started\ndata: {"type":"started","jobId":"j3","timestamp":"2026-01-01"}\n\n',
      'event: failed\ndata: {"type":"failed","jobId":"j3","timestamp":"2026-01-01","error":"Engine timeout"}\n\n',
      'event: progress\ndata: {"type":"progress","jobId":"j3","timestamp":"2026-01-01","progress":0}\n\n',
    ];

    (global.fetch as Mock).mockResolvedValue(mockSSEResponse(sseData));

    const updates = [];
    for await (const update of client.streamJobUpdates('j3')) {
      updates.push(update);
    }

    expect(updates).toHaveLength(2);
    expect(updates[0].type).toBe('started');
    expect(updates[1].type).toBe('failed');
    expect(updates[1].error).toBe('Engine timeout');
  });

  it('streamJobUpdates skips connected events', async () => {
    const client = createClient();
    const sseData = [
      'event: connected\ndata: {"msg":"welcome"}\n\n',
      'event: progress\ndata: {"type":"progress","jobId":"j4","timestamp":"2026-01-01","progress":25}\n\n',
      'event: completed\ndata: {"type":"completed","jobId":"j4","timestamp":"2026-01-01"}\n\n',
    ];

    (global.fetch as Mock).mockResolvedValue(mockSSEResponse(sseData));

    const updates = [];
    for await (const update of client.streamJobUpdates('j4')) {
      updates.push(update);
    }

    // 'connected' event should be skipped — only progress + completed
    expect(updates).toHaveLength(2);
    expect(updates[0].type).toBe('progress');
    expect(updates[1].type).toBe('completed');
  });

  it('streamJobUpdates skips malformed JSON data', async () => {
    const client = createClient();
    const sseData = [
      'event: progress\ndata: {this is not valid json}\n\n',
      'event: progress\ndata: {"type":"progress","jobId":"j5","timestamp":"2026-01-01","progress":75}\n\n',
      'event: completed\ndata: {"type":"completed","jobId":"j5","timestamp":"2026-01-01"}\n\n',
    ];

    (global.fetch as Mock).mockResolvedValue(mockSSEResponse(sseData));

    const updates = [];
    for await (const update of client.streamJobUpdates('j5')) {
      updates.push(update);
    }

    // Malformed event should be silently skipped
    expect(updates).toHaveLength(2);
    expect(updates[0].type).toBe('progress');
    expect(updates[0].progress).toBe(75);
    expect(updates[1].type).toBe('completed');
  });
});

// =========================================================================
// Jobs API wire format (v1 answers with the bare object, errors are one shape)
// =========================================================================

describe('Jobs API wire format', () => {
  it('createJob returns the bare job the API sends (no data envelope)', async () => {
    const client = createClient();
    const job = { id: 'job_9', status: 'pending', tasks: {} };
    (global.fetch as Mock).mockResolvedValue(mockResponse(job));
    expect(await client.createJob({ tasks: {} as never })).toEqual(job);
  });

  it('listJobs accepts the bare array', async () => {
    const client = createClient();
    (global.fetch as Mock).mockResolvedValue(mockResponse([{ id: 'job_1' }]));
    const out = await client.listJobs();
    expect(out.data).toEqual([{ id: 'job_1' }]);
  });

  it('surfaces the error code from the single error shape', async () => {
    const client = createClient();
    (global.fetch as Mock).mockResolvedValue(
      mockResponse({ success: false, error: { code: 'OPERATION_NOT_SUPPORTED', message: 'metadata/write is not supported' } }, { status: 422 }),
    );
    await expect(client.createJob({ tasks: {} as never })).rejects.toMatchObject({ code: 'OPERATION_NOT_SUPPORTED', statusCode: 422 });
  });

  it('QUOTA_EXCEEDED on a 429 is an ApiError, not a rate-limit retry', async () => {
    const client = createClient();
    (global.fetch as Mock).mockResolvedValue(
      mockResponse({ success: false, error: { code: 'QUOTA_EXCEEDED', message: 'Daily limit reached' } }, { status: 429 }),
    );
    await expect(client.createJob({ tasks: {} as never })).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
  });
});

describe('verifyJobWebhook', () => {
  const secret = 'whsec_test';
  const sign = (b: string) => 'sha256=' + createHmac('sha256', secret).update(b).digest('hex');
  it('accepts a fresh, correctly signed body and rejects tampering and stale events', () => {
    const body = JSON.stringify({ event: 'job.finished', timestamp: new Date().toISOString() });
    expect(verifyJobWebhook(body, sign(body), secret)).toBe(true);
    expect(verifyJobWebhook(body + ' ', sign(body), secret)).toBe(false);
    expect(verifyJobWebhook(body, sign(body), 'other')).toBe(false);
    const stale = JSON.stringify({ event: 'job.failed', timestamp: new Date(Date.now() - 3_600_000).toISOString() });
    expect(verifyJobWebhook(stale, sign(stale), secret)).toBe(false);
    expect(verifyJobWebhook(stale, sign(stale), secret, 0)).toBe(true);
  });
});
