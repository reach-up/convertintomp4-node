import type {
  ClientOptions,
  Job,
  JobStatus,
  Task,
  CreateJobRequest,
  ListJobsParams,
  ApiResponse,
  Format,
  FormatConversionOptions,
  Webhook,
  CreateWebhookRequest,
  WaitForJobOptions,
  QuickConvertOptions,
  ConversionStatus,
  ImportFromUrlOptions,
  PdfOcrOptions,
  PdfSplitOptions,
  PdfMergeOptions,
  PdfEncryptOptions,
  PdfDecryptOptions,
  PdfRotateOptions,
  PdfCompressOptions,
  PdfToPdfaOptions,
  PdfExtractPagesOptions,
  PdfWatermarkOptions,
  PdfOperationResult,
  PresignUploadRequest,
  PresignUploadResponse,
  StorageConvertRequest,
  StorageConvertResponse,
  JobUpdate,
  StreamJobOptions,
  WebhookSecret,
} from './types.js';

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Most endpoints answer `{ success, data }`; the Jobs API answers with the bare
 * object. Accept both so one client works against either.
 */
function unwrapEnvelope<T>(body: unknown): T {
  if (body && typeof body === 'object' && !Array.isArray(body) && 'success' in body && 'data' in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

export class ConvertIntoMP4Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConvertIntoMP4Error';
  }
}

export class ApiError extends ConvertIntoMP4Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class AuthenticationError extends ApiError {
  constructor(message: string = 'Invalid or missing API key') {
    super(401, 'AUTHENTICATION_ERROR', message);
    this.name = 'AuthenticationError';
  }
}

export class RateLimitError extends ApiError {
  public readonly retryAfter?: number;

  constructor(retryAfter?: number) {
    super(429, 'RATE_LIMIT_EXCEEDED', 'Rate limit exceeded');
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class TimeoutError extends ConvertIntoMP4Error {
  constructor(message: string = 'Operation timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

// ============================================================================
// Client
// ============================================================================

const DEFAULT_BASE_URL = 'https://api.convertintomp4.com/v1';
/** Keep in sync with `version` in package.json. */
const USER_AGENT = 'convertintomp4-node/1.2.0';

export class ConvertIntoMP4Client {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly defaultHeaders: Record<string, string>;

  constructor(options: ClientOptions) {
    if (!options.apiKey) {
      throw new ConvertIntoMP4Error('API key is required');
    }

    this.apiKey = options.apiKey;
    // Sandbox is a request header on the normal API host (there is no separate host).
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.timeout = options.timeout ?? 30000;
    this.defaultHeaders = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
      ...(options.sandbox ? { 'X-Sandbox': 'true' } : {}),
      ...options.headers,
    };
  }

  // ==========================================================================
  // HTTP Methods
  // ==========================================================================

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    customHeaders?: Record<string, string>,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const headers = { ...this.defaultHeaders, ...customHeaders };

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (response.status === 204) {
        return undefined as T;
      }

      const data = await response.json() as ApiResponse<T>;

      if (!response.ok) {
        if (response.status === 401) {
          throw new AuthenticationError(data.error?.message);
        }
        if (response.status === 429 && data.error?.code !== 'QUOTA_EXCEEDED') {
          const retryAfter = response.headers.get('Retry-After');
          throw new RateLimitError(retryAfter ? parseInt(retryAfter) : undefined);
        }
        throw new ApiError(
          response.status,
          data.error?.code ?? 'UNKNOWN_ERROR',
          data.error?.message ?? 'An unknown error occurred',
          data.error?.details,
        );
      }

      return unwrapEnvelope<T>(data);
    } catch (error) {
      if (error instanceof ConvertIntoMP4Error) {
        throw error;
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new TimeoutError(`Request to ${path} timed out after ${this.timeout}ms`);
      }
      throw new ConvertIntoMP4Error(
        `Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async requestRaw(
    method: string,
    path: string,
    body?: unknown,
    customHeaders?: Record<string, string>,
  ): Promise<ApiResponse<unknown>> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const headers = { ...this.defaultHeaders, ...customHeaders };

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (response.status === 204) {
        return { success: true, data: undefined };
      }

      const data = await response.json() as ApiResponse<unknown>;

      if (!response.ok) {
        if (response.status === 401) {
          throw new AuthenticationError(data.error?.message);
        }
        if (response.status === 429 && data.error?.code !== 'QUOTA_EXCEEDED') {
          const retryAfter = response.headers.get('Retry-After');
          throw new RateLimitError(retryAfter ? parseInt(retryAfter) : undefined);
        }
        throw new ApiError(
          response.status,
          data.error?.code ?? 'UNKNOWN_ERROR',
          data.error?.message ?? 'An unknown error occurred',
          data.error?.details,
        );
      }

      return data;
    } catch (error) {
      if (error instanceof ConvertIntoMP4Error) {
        throw error;
      }
      throw new ConvertIntoMP4Error(
        `Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async uploadMultipart<T>(
    path: string,
    file: Blob | Buffer,
    fields: Record<string, string>,
    filename: string,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const formData = new FormData();

      // Add the file. The filename MUST carry the real source extension: the
      // API derives `sourceFormat` from `path.extname(filename)` and rejects
      // an extension-less upload with `UNSUPPORTED_CONVERSION` ("Cannot
      // convert  to MP4"). See apps/api/src/routes/convert.ts.
      if (file instanceof Blob) {
        formData.append('file', file, filename);
      } else {
        const blob = new Blob([new Uint8Array(file)]);
        formData.append('file', blob, filename);
      }

      // Add other fields
      for (const [key, value] of Object.entries(fields)) {
        formData.append(key, value);
      }

      const headers: Record<string, string> = {
        'Authorization': `Bearer ${this.apiKey}`,
        'User-Agent': USER_AGENT,
      };

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
        signal: controller.signal,
      });

      const data = await response.json() as T;

      if (!response.ok) {
        const errorData = data as unknown as ApiResponse<unknown>;
        throw new ApiError(
          response.status,
          errorData.error?.code ?? 'UPLOAD_ERROR',
          errorData.error?.message ?? 'Upload failed',
        );
      }

      return data;
    } catch (error) {
      if (error instanceof ConvertIntoMP4Error) {
        throw error;
      }
      throw new ConvertIntoMP4Error(
        `Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ==========================================================================
  // Job Methods
  // ==========================================================================

  /**
   * Create a new conversion job with one or more tasks.
   *
   * @example
   * ```ts
   * const job = await client.createJob({
   *   tasks: {
   *     'import-file': { operation: 'import/url', url: 'https://example.com/video.mp4' },
   *     'convert': { operation: 'convert', input: 'import-file', output_format: 'webm' },
   *     'export': { operation: 'export/url', input: 'convert' },
   *   }
   * });
   * ```
   */
  async createJob(request: CreateJobRequest): Promise<Job> {
    return this.request<Job>('POST', '/jobs', request);
  }

  /**
   * Get the details and status of a specific job.
   */
  async getJob(jobId: string): Promise<Job> {
    return this.request<Job>('GET', `/jobs/${encodeURIComponent(jobId)}`);
  }

  /**
   * List all jobs, optionally filtered by status or tag.
   */
  async listJobs(params?: ListJobsParams): Promise<{ data: Job[]; meta?: { total: number; limit: number; offset: number } }> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.tag) searchParams.set('tag', params.tag);
    if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
    if (params?.offset !== undefined) searchParams.set('offset', String(params.offset));

    const query = searchParams.toString();
    const path = `/jobs${query ? `?${query}` : ''}`;
    const response = await this.requestRaw('GET', path);
    // GET /v1/jobs answers with a bare array; an envelope is accepted too.
    if (Array.isArray(response)) return { data: response as unknown as Job[] };
    return response as unknown as { data: Job[]; meta?: { total: number; limit: number; offset: number } };
  }

  /**
   * Delete a job and its associated files.
   */
  async deleteJob(jobId: string): Promise<void> {
    await this.request<void>('DELETE', `/jobs/${encodeURIComponent(jobId)}`);
  }

  /**
   * The secret that signs webhooks sent to a job's `webhook_url`
   * (`X-ConvertIntoMP4-Signature`). Verify deliveries with `verifyJobWebhook`.
   */
  async getJobWebhookSecret(): Promise<WebhookSecret> {
    return this.request<WebhookSecret>('GET', '/jobs/webhook-secret');
  }

  /**
   * Issue a new job webhook secret. Deliveries signed after this call use it.
   */
  async rotateJobWebhookSecret(): Promise<WebhookSecret> {
    return this.request<WebhookSecret>('POST', '/jobs/webhook-secret/rotate');
  }

  /**
   * Cancel a running job.
   */
  async cancelJob(jobId: string): Promise<Job> {
    return this.request<Job>('POST', `/jobs/${encodeURIComponent(jobId)}/cancel`);
  }

  /**
   * Retry a failed job.
   */
  async retryJob(jobId: string): Promise<Job> {
    return this.request<Job>('POST', `/jobs/${encodeURIComponent(jobId)}/retry`);
  }

  /**
   * Adapt a `/v1/status/{jobId}` payload to the `Job` shape `waitForJob`
   * returns, so both job namespaces hand back the same object.
   *
   * `expired` maps to `failed` on purpose: the conversion finished but the
   * output was swept by the retention window, so there is nothing to
   * download — the task error says exactly that.
   */
  private conversionStatusToJob(status: ConversionStatus): Job {
    const raw = String(status.status ?? '').toLowerCase();
    const jobStatus: JobStatus =
      raw === 'completed'
        ? 'completed'
        : raw === 'failed' || raw === 'expired'
          ? 'failed'
          : raw === 'active' || raw === 'processing'
            ? 'processing'
            : 'pending';

    const error =
      raw === 'expired'
        ? 'Output expired and is no longer available for download.'
        : typeof status.error === 'string'
          ? status.error
          : undefined;

    const origin = this.baseUrl.replace(/\/v1$/, '');
    const createdAt = status.createdAt ?? new Date().toISOString();

    const task: Task = {
      id: status.jobId,
      operation: 'convert',
      status: jobStatus === 'processing' ? 'processing' : jobStatus,
      progress: typeof status.progress === 'number' ? status.progress : 0,
      created_at: createdAt,
      ...(error ? { error } : {}),
      ...(status.result
        ? {
            result: {
              url: `${origin}${status.result.downloadUrl}`,
              file: {
                name: `${status.jobId}.${status.result.outputFormat ?? status.targetFormat ?? ''}`,
                size: status.result.outputSize ?? 0,
                mime_type: 'application/octet-stream',
              },
            },
          }
        : {}),
    };

    return {
      id: status.jobId,
      status: jobStatus,
      tasks: { convert: task },
      created_at: createdAt,
      ...(jobStatus === 'completed' || jobStatus === 'failed'
        ? { completed_at: new Date().toISOString() }
        : {}),
    };
  }

  /**
   * Get the status of a quick-convert job (`convert`, `uploadFile`,
   * `importFromUrl`, `convertFromStorage`).
   *
   * These jobs live in the conversion queue, NOT in the Jobs API's job store,
   * so they are readable at `GET /v1/status/{jobId}` and 404 on
   * `GET /v1/jobs/{jobId}`. The endpoint returns a bare object (no
   * `{ success, data }` envelope), which is why it does not go through
   * `request()`.
   */
  async getConversionStatus(jobId: string): Promise<ConversionStatus> {
    const url = `${this.baseUrl}/status/${encodeURIComponent(jobId)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.defaultHeaders,
        signal: controller.signal,
      });

      // On success `error` is a plain string (the scrubbed failure reason);
      // on an HTTP error it is an `{ code, message }` object — parse loosely.
      const data = (await response.json()) as Record<string, unknown>;

      if (!response.ok) {
        if (response.status === 401) {
          throw new AuthenticationError();
        }
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          throw new RateLimitError(retryAfter ? parseInt(retryAfter) : undefined);
        }
        const err =
          typeof data.error === 'object' && data.error !== null
            ? (data.error as { code?: string; message?: string })
            : undefined;
        throw new ApiError(
          response.status,
          err?.code ?? 'UNKNOWN_ERROR',
          err?.message ?? 'An unknown error occurred',
        );
      }

      return data as unknown as ConversionStatus;
    } catch (error) {
      if (error instanceof ConvertIntoMP4Error) {
        throw error;
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new TimeoutError(
          `Request to /status/${jobId} timed out after ${this.timeout}ms`,
        );
      }
      throw new ConvertIntoMP4Error(
        `Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Poll a job until it reaches a terminal state (completed, failed, or cancelled).
   *
   * Handles BOTH job namespaces the API exposes:
   *  - Jobs API pipelines (`createJob`) return `job_…` ids stored in Redis and
   *    are polled at `GET /v1/jobs/{id}`.
   *  - Quick-convert jobs (`convert`, `uploadFile`, `importFromUrl`,
   *    `convertFromStorage`) return a bare 12-char id that NEVER enters that
   *    store — polling `/v1/jobs/{id}` 404s forever. Those are polled at
   *    `GET /v1/status/{id}` and adapted to the `Job` shape below.
   *
   * @param jobId - The job ID to poll
   * @param options - Polling configuration
   * @param options.interval - Polling interval in milliseconds (default: 1000)
   * @param options.timeout - Maximum time to wait in milliseconds (default: 300000 / 5 minutes)
   * @returns The completed job
   * @throws {TimeoutError} If the job does not complete within the timeout
   *
   * @example
   * ```ts
   * const { jobId } = await client.convert(buffer, 'mp4', { filename: 'clip.mov' });
   * const job = await client.waitForJob(jobId, { interval: 2000, timeout: 60000 });
   * ```
   */
  async waitForJob(jobId: string, options?: WaitForJobOptions): Promise<Job> {
    const interval = options?.interval ?? 1000;
    const timeout = options?.timeout ?? 300000;
    const startTime = Date.now();
    const isPipelineJob = jobId.startsWith('job_');

    while (Date.now() - startTime < timeout) {
      const job = isPipelineJob
        ? await this.getJob(jobId)
        : this.conversionStatusToJob(await this.getConversionStatus(jobId));

      if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
        return job;
      }

      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new TimeoutError(
      `Job ${jobId} did not complete within ${timeout}ms`,
    );
  }

  // ==========================================================================
  // Quick Convert Methods
  // ==========================================================================

  /**
   * Resolve the multipart filename for a quick-convert upload.
   *
   * The API reads the SOURCE format off this filename's extension, so a
   * generic "upload" makes every call fail with `UNSUPPORTED_CONVERSION`.
   * Order: explicit `options.filename` → the `File`'s own `name` → error.
   */
  private static resolveUploadFilename(
    file: Blob | Buffer,
    filename?: unknown,
  ): string {
    const explicit = typeof filename === 'string' ? filename.trim() : '';
    const named = file as unknown as { name?: unknown };
    const inherited =
      !explicit && typeof named.name === 'string' ? named.name.trim() : '';
    const resolved = explicit || inherited;

    if (!resolved || !/\.[A-Za-z0-9]+$/.test(resolved)) {
      throw new ConvertIntoMP4Error(
        'A source filename with its extension is required (e.g. { filename: "clip.mov" }) — ' +
          'the API derives the source format from the extension. Pass a File, or set options.filename.',
      );
    }

    return resolved;
  }

  /**
   * Quick file conversion - upload a file and convert it in one step.
   * Uses multipart form upload.
   *
   * `options.filename` is required unless `file` is a `File` (which carries
   * its own name): the API derives the source format from the extension.
   * It is consumed by the SDK and never sent as a form field.
   *
   * @example
   * ```ts
   * const result = await client.convert(fileBuffer, 'webm', {
   *   filename: 'clip.mov',
   *   quality: 'high',
   * });
   * ```
   */
  async convert(
    file: Blob | Buffer,
    targetFormat: string,
    options?: QuickConvertOptions,
  ): Promise<{ jobId: string; status: string; statusUrl: string }> {
    const { filename, ...formOptions } = options ?? {};
    const uploadFilename = ConvertIntoMP4Client.resolveUploadFilename(file, filename);

    const fields: Record<string, string> = {
      targetFormat,
      ...Object.fromEntries(
        Object.entries(formOptions).map(([k, v]) => [k, String(v)]),
      ),
    };

    return this.uploadMultipart('/convert', file, fields, uploadFilename);
  }

  /**
   * Upload a file for conversion via multipart upload.
   */
  async uploadFile(
    file: Blob | Buffer,
    targetFormat: string,
    options?: QuickConvertOptions,
  ): Promise<{ jobId: string; status: string; statusUrl: string }> {
    return this.convert(file, targetFormat, options);
  }

  /**
   * Import a file from a URL and start conversion.
   */
  async importFromUrl(
    url: string,
    options: ImportFromUrlOptions,
  ): Promise<{ jobId: string; status: string; statusUrl: string }> {
    return this.request('POST', '/import/url', { url, ...options });
  }

  /**
   * Download a converted file by job ID.
   * Returns the raw response for streaming.
   */
  async downloadFile(jobId: string): Promise<Response> {
    const url = `${this.baseUrl}/download/${encodeURIComponent(jobId)}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'User-Agent': USER_AGENT,
      },
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as ApiResponse<unknown>;
      throw new ApiError(
        response.status,
        data.error?.code ?? 'DOWNLOAD_ERROR',
        data.error?.message ?? 'Download failed',
      );
    }

    return response;
  }

  // ==========================================================================
  // Format Methods
  // ==========================================================================

  /**
   * List all supported formats.
   *
   * @param category - Optionally filter by category (video, audio, image, document)
   */
  async listFormats(category?: string): Promise<Format[]> {
    const query = category ? `?category=${encodeURIComponent(category)}` : '';
    return this.request<Format[]>('GET', `/formats${query}`);
  }

  /**
   * Get detailed information about a specific format.
   */
  async getFormat(formatId: string): Promise<Format> {
    return this.request<Format>('GET', `/formats/${encodeURIComponent(formatId)}`);
  }

  /**
   * Get available conversion options for a format pair.
   */
  async getFormatOptions(
    inputFormat: string,
    outputFormat: string,
  ): Promise<FormatConversionOptions> {
    const params = new URLSearchParams({
      input_format: inputFormat,
      output_format: outputFormat,
    });
    return this.request<FormatConversionOptions>(
      'GET',
      `/formats/options?${params.toString()}`,
    );
  }

  // ==========================================================================
  // Webhook Methods
  // ==========================================================================

  /**
   * Create a new webhook subscription.
   *
   * @example
   * ```ts
   * const webhook = await client.createWebhook(
   *   'https://example.com/webhook',
   *   ['job.completed', 'job.failed']
   * );
   * ```
   */
  async createWebhook(
    url: string,
    events: string[],
    options?: { secret?: string; metadata?: Record<string, string> },
  ): Promise<Webhook> {
    const body: CreateWebhookRequest = { url, events, ...options };
    return this.request<Webhook>('POST', '/webhooks', body);
  }

  /**
   * List all registered webhooks.
   */
  async listWebhooks(): Promise<Webhook[]> {
    return this.request<Webhook[]>('GET', '/webhooks');
  }

  /**
   * Get a specific webhook by ID.
   */
  async getWebhook(webhookId: string): Promise<Webhook> {
    return this.request<Webhook>('GET', `/webhooks/${encodeURIComponent(webhookId)}`);
  }

  /**
   * Delete a webhook subscription.
   */
  async deleteWebhook(webhookId: string): Promise<void> {
    await this.request<void>('DELETE', `/webhooks/${encodeURIComponent(webhookId)}`);
  }

  // ==========================================================================
  // PDF Operations
  //
  // DEPRECATED — every method below calls `/v1/pdf/*`, which the API retired on
  // 2026-07-26. Those endpoints accepted a file URL and passed it to engines
  // that only read uploaded files, so no input could ever succeed; they now
  // answer `400 PDF_ENDPOINT_NOT_SUPPORTED` naming the real request. Use
  // `convert(file, 'pdf', { filename, toolOperation: 'ocr-pdf' | 'compress-pdf'
  // | 'split-pdf' | … })` instead, and `/v1/convert/merge` for merging. Kept so
  // existing callers surface the API's message; removed in the next major.
  // ==========================================================================

  /**
   * Perform OCR on a PDF file.
   *
   * @deprecated `/v1/pdf/ocr` was retired (it never worked). Use
   * `convert(file, 'pdf', { filename, toolOperation: 'ocr-pdf', language })`.
   */
  async pdfOcr(options: PdfOcrOptions): Promise<PdfOperationResult> {
    return this.request<PdfOperationResult>('POST', '/pdf/ocr', options);
  }

  /**
   * Split a PDF into multiple documents.
   *
   * @deprecated `/v1/pdf/split` was retired (it never worked). Use `convert(file, 'pdf', { filename, toolOperation: 'split-pdf', pages })`.
   */
  async pdfSplit(options: PdfSplitOptions): Promise<PdfOperationResult[]> {
    return this.request<PdfOperationResult[]>('POST', '/pdf/split', options);
  }

  /**
   * Merge multiple PDF files into one.
   *
   * @deprecated `/v1/pdf/merge` was retired (it never worked). Use the multipart endpoint `POST /v1/convert/merge` with `mergeType=pdf`.
   */
  async pdfMerge(options: PdfMergeOptions): Promise<PdfOperationResult> {
    return this.request<PdfOperationResult>('POST', '/pdf/merge', options);
  }

  /**
   * Encrypt a PDF with a password.
   *
   * @deprecated `/v1/pdf/encrypt` was retired (it never worked). Use `convert(file, 'pdf', { filename, toolOperation: 'encrypt-pdf', password })`.
   */
  async pdfEncrypt(options: PdfEncryptOptions): Promise<PdfOperationResult> {
    return this.request<PdfOperationResult>('POST', '/pdf/encrypt', options);
  }

  /**
   * Decrypt a password-protected PDF.
   *
   * @deprecated `/v1/pdf/decrypt` was retired (it never worked). Use `convert(file, 'pdf', { filename, toolOperation: 'decrypt-pdf', password })`.
   */
  async pdfDecrypt(options: PdfDecryptOptions): Promise<PdfOperationResult> {
    return this.request<PdfOperationResult>('POST', '/pdf/decrypt', options);
  }

  /**
   * Rotate pages in a PDF.
   *
   * @deprecated `/v1/pdf/rotate` was retired (it never worked). Use `convert(file, 'pdf', { filename, toolOperation: 'rotate-pdf', rotate, pages })`.
   */
  async pdfRotate(options: PdfRotateOptions): Promise<PdfOperationResult> {
    return this.request<PdfOperationResult>('POST', '/pdf/rotate', options);
  }

  /**
   * Compress a PDF to reduce file size.
   *
   * @deprecated `/v1/pdf/compress` was retired (it never worked). Use `convert(file, 'pdf', { filename, toolOperation: 'compress-pdf', pdfQuality })`.
   */
  async pdfCompress(options: PdfCompressOptions): Promise<PdfOperationResult> {
    return this.request<PdfOperationResult>('POST', '/pdf/compress', options);
  }

  /**
   * Convert a PDF to PDF/A archival format.
   *
   * @deprecated `/v1/pdf/to-pdfa` was retired (it never worked). Use `convert(file, 'pdf', { filename, toolOperation: 'to-pdfa', pdfaVersion })`.
   */
  async pdfToPdfa(options: PdfToPdfaOptions): Promise<PdfOperationResult> {
    return this.request<PdfOperationResult>('POST', '/pdf/to-pdfa', options);
  }

  /**
   * Extract specific pages from a PDF.
   *
   * @deprecated `/v1/pdf/extract-pages` was retired (it never worked). Use `convert(file, 'pdf', { filename, toolOperation: 'extract-pdf-pages', pages })`.
   */
  async pdfExtractPages(options: PdfExtractPagesOptions): Promise<PdfOperationResult> {
    return this.request<PdfOperationResult>('POST', '/pdf/extract-pages', options);
  }

  /**
   * Add a text or image watermark to a PDF.
   *
   * @deprecated `/v1/pdf/watermark` was retired (it never worked). Use `convert(file, 'pdf', { filename, toolOperation: 'add-watermark-pdf', watermarkText })`.
   */
  async pdfWatermark(options: PdfWatermarkOptions): Promise<PdfOperationResult> {
    return this.request<PdfOperationResult>('POST', '/pdf/watermark', options);
  }

  // ==========================================================================
  // Presigned Upload Methods (Direct-to-R2)
  // ==========================================================================

  /**
   * Get a presigned URL for uploading a file directly to R2 storage.
   * This bypasses the API server for large file uploads.
   *
   * @example
   * ```ts
   * // 1. Get presigned URL
   * const { uploadUrl, storageKey } = await client.getPresignedUploadUrl({
   *   filename: 'video.mp4',
   *   contentType: 'video/mp4',
   *   fileSize: 1024 * 1024 * 500, // 500MB
   * });
   *
   * // 2. Upload directly to R2
   * await fetch(uploadUrl, { method: 'PUT', body: fileBuffer });
   *
   * // 3. Start conversion from uploaded file
   * const result = await client.convertFromStorage({
   *   storageKey,
   *   sourceFormat: 'mp4',
   *   targetFormat: 'webm',
   * });
   * ```
   */
  async getPresignedUploadUrl(
    options: PresignUploadRequest,
  ): Promise<PresignUploadResponse> {
    return this.request<PresignUploadResponse>('POST', '/uploads/presign', options);
  }

  /**
   * Upload a file directly to R2 using a presigned URL, then start conversion.
   * Combines getPresignedUploadUrl + PUT upload + convertFromStorage into one call.
   *
   * @example
   * ```ts
   * const result = await client.uploadDirect(fileBuffer, 'video.mp4', 'video/mp4', {
   *   targetFormat: 'webm',
   *   quality: 'high',
   * });
   * ```
   */
  async uploadDirect(
    file: Buffer | Blob,
    filename: string,
    contentType: string,
    convertOptions: Omit<StorageConvertRequest, 'storageKey' | 'sourceFormat'> & { targetFormat: string },
  ): Promise<StorageConvertResponse> {
    // Get presigned URL
    const presign = await this.getPresignedUploadUrl({
      filename,
      contentType,
      fileSize: file instanceof Blob ? file.size : file.length,
    });

    // Upload directly to R2
    const body = Buffer.isBuffer(file) ? new Uint8Array(file) : file;
    const uploadResponse = await fetch(presign.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body,
    });

    if (!uploadResponse.ok) {
      throw new ApiError(
        uploadResponse.status,
        'UPLOAD_FAILED',
        `Direct upload failed: ${uploadResponse.statusText}`,
      );
    }

    // Derive source format from filename
    const ext = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : '';

    // Start conversion from storage
    return this.convertFromStorage({
      storageKey: presign.storageKey,
      sourceFormat: ext,
      originalName: filename,
      ...convertOptions,
    });
  }

  /**
   * Start a conversion from a file already uploaded to R2 storage.
   */
  async convertFromStorage(
    options: StorageConvertRequest,
  ): Promise<StorageConvertResponse> {
    return this.request<StorageConvertResponse>('POST', '/convert/storage', options);
  }

  // ==========================================================================
  // Real-time Job Streaming (SSE)
  // ==========================================================================

  /**
   * Stream real-time job updates via Server-Sent Events (SSE).
   * Returns an async iterator of job update events.
   *
   * @example
   * ```ts
   * const job = await client.convert(file, 'webm');
   *
   * for await (const update of client.streamJobUpdates(job.jobId)) {
   *   console.log(`${update.type}: ${update.progress}%`);
   *   if (update.type === 'completed') {
   *     console.log('Download:', update.outputUrl);
   *     break;
   *   }
   *   if (update.type === 'failed') {
   *     console.error('Error:', update.error);
   *     break;
   *   }
   * }
   * ```
   */
  async *streamJobUpdates(
    jobId: string,
    options?: StreamJobOptions,
  ): AsyncGenerator<JobUpdate, void, undefined> {
    // SSE endpoint is outside /v1 prefix
    const baseOrigin = this.baseUrl.replace(/\/v1$/, '');
    const url = `${baseOrigin}/sse/jobs/${encodeURIComponent(jobId)}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'text/event-stream',
        'User-Agent': USER_AGENT,
      },
      signal: options?.signal,
    });

    if (!response.ok) {
      throw new ApiError(
        response.status,
        'SSE_CONNECTION_FAILED',
        `Failed to connect to SSE stream: ${response.statusText}`,
      );
    }

    if (!response.body) {
      throw new ConvertIntoMP4Error('No response body for SSE stream');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let eventType = '';
        let eventData = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            eventData = line.slice(6).trim();
          } else if (line === '' && eventData) {
            // Empty line = end of event
            if (eventType !== 'connected') {
              try {
                const update = JSON.parse(eventData) as JobUpdate;
                yield update;

                // Auto-close on terminal events
                if (update.type === 'completed' || update.type === 'failed') {
                  return;
                }
              } catch {
                // Skip malformed events
              }
            }
            eventType = '';
            eventData = '';
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Subscribe to job updates with callback functions.
   * Returns a cleanup function to stop listening.
   *
   * @example
   * ```ts
   * const unsubscribe = client.onJobUpdate(jobId, {
   *   onProgress: (update) => console.log(`Progress: ${update.progress}%`),
   *   onCompleted: (update) => console.log('Done!', update.outputUrl),
   *   onFailed: (update) => console.error('Error:', update.error),
   * });
   *
   * // Later: stop listening
   * unsubscribe();
   * ```
   */
  onJobUpdate(
    jobId: string,
    callbacks: {
      onStarted?: (update: JobUpdate) => void;
      onProgress?: (update: JobUpdate) => void;
      onCompleted?: (update: JobUpdate) => void;
      onFailed?: (update: JobUpdate) => void;
      onError?: (error: Error) => void;
    },
  ): () => void {
    const controller = new AbortController();

    (async () => {
      try {
        for await (const update of this.streamJobUpdates(jobId, { signal: controller.signal })) {
          switch (update.type) {
            case 'started':
              callbacks.onStarted?.(update);
              break;
            case 'progress':
              callbacks.onProgress?.(update);
              break;
            case 'completed':
              callbacks.onCompleted?.(update);
              return;
            case 'failed':
              callbacks.onFailed?.(update);
              return;
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
        }
      }
    })();

    return () => controller.abort();
  }
}
