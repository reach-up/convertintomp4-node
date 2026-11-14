// ============================================================================
// Core Types
// ============================================================================

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export type TaskOperation =
  | 'import/url'
  | 'import/upload'
  | 'import/base64'
  | 'import/raw'
  | 'convert'
  | 'compress'
  | 'merge'
  | 'optimize'
  | 'thumbnail'
  | 'metadata/read'
  | 'capture-website'
  | 'archive/create'
  | 'archive/extract'
  | 'crop'
  | 'trim'
  | 'pdf/ocr'
  | 'pdf/split'
  | 'pdf/merge'
  | 'pdf/encrypt'
  | 'pdf/decrypt'
  | 'pdf/rotate'
  | 'pdf/compress'
  | 'pdf/extract-pages'
  | 'pdf/watermark'
  | 'export/url'
  | 'export/upload'
  | 'export/s3'
  | 'export/gcs'
  | 'export/azure'
  | 'export/sftp';

// ============================================================================
// Task Result
// ============================================================================

export interface TaskResultFile {
  name: string;
  size: number;
  mime_type: string;
}

export interface TaskResult {
  file?: TaskResultFile;
  /** import/upload: POST the file here (multipart, field "file", same API key) while the task is pending. */
  form?: { url: string; method: 'POST'; field: 'file' };
  url?: string;
  expires_at?: string;
}

// ============================================================================
// Task
// ============================================================================

export interface Task {
  id: string;
  operation: TaskOperation;
  status: TaskStatus;
  progress: number;
  input?: string;
  result?: TaskResult;
  error?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

// ============================================================================
// Job
// ============================================================================

export interface Job {
  id: string;
  status: JobStatus;
  tag?: string;
  webhook_url?: string;
  tasks: Record<string, Task>;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

// ============================================================================
// Task Definitions (for job creation)
// ============================================================================

export interface ImportUrlTask {
  operation: 'import/url';
  url: string;
  filename?: string;
  headers?: Record<string, string>;
}

export interface ImportUploadTask {
  operation: 'import/upload';
  filename?: string;
}

export interface ImportBase64Task {
  operation: 'import/base64';
  file: string;
  filename: string;
}

export interface ImportRawTask {
  operation: 'import/raw';
  file: string;
  filename: string;
}

export interface ConvertTask {
  operation: 'convert';
  input: string;
  output_format: string;
  options?: ConversionOptions;
}

export interface ConversionOptions {
  // Video options
  quality?: string;
  resolution?: string;
  codec?: string;
  fps?: number;
  bitrate?: string;
  crf?: number;
  preset?: string;
  profile?: string;
  level?: string;
  pixel_format?: string;
  audio_codec?: string;
  audio_bitrate?: string;
  audio_channels?: number;
  audio_sample_rate?: string;
  audio_normalize?: boolean;
  // Image options
  width?: number;
  height?: number;
  fit?: string;
  dpi?: number;
  strip_metadata?: boolean;
  auto_orient?: boolean;
  progressive?: boolean;
  lossless?: boolean;
  background?: string;
  // PDF options
  pdf_quality?: string;
  password?: string;
  pages?: string;
  // Watermark
  watermark?: {
    text?: string;
    image?: string;
    position?: string;
    opacity?: number;
  };
}

export interface OptimizeTask {
  operation: 'optimize';
  input: string;
  options?: {
    quality?: number;
    profile?: 'web' | 'print' | 'archive';
  };
}

export interface CompressTask {
  operation: 'compress';
  input: string;
  options?: {
    quality?: number;
  };
}

export interface MergeTask {
  operation: 'merge';
  input: string[];
  output_format: string;
}

export interface ThumbnailTask {
  operation: 'thumbnail';
  input: string;
  output_format?: 'png' | 'jpg' | 'webp';
  options?: {
    width?: number;
    height?: number;
    fit?: 'max' | 'crop' | 'scale';
  };
}

export interface MetadataReadTask {
  operation: 'metadata/read';
  input: string;
}

export interface CaptureWebsiteTask {
  operation: 'capture-website';
  url: string;
  output_format: 'png' | 'jpg' | 'pdf';
  options?: {
    width?: number;
    height?: number;
    full_page?: boolean;
    device_scale_factor?: number;
    wait_time?: number;
    wait_for_selector?: string;
    page_format?: 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal';
    landscape?: boolean;
    print_background?: boolean;
  };
}

export interface ArchiveCreateTask {
  operation: 'archive/create';
  input: string[];
  output_format: 'zip' | 'tar' | 'tar.gz' | 'tar.bz2' | '7z';
  options?: {
    password?: string;
  };
}

export interface ArchiveExtractTask {
  operation: 'archive/extract';
  input: string;
  options?: {
    password?: string;
  };
}

export interface CropTask {
  operation: 'crop';
  input: string;
  options: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface TrimTask {
  operation: 'trim';
  input: string;
  options: {
    start_time?: string;
    end_time?: string;
    duration?: string;
  };
}

// PDF task definitions
export interface PdfOcrTask {
  operation: 'pdf/ocr';
  input: string;
  language?: string;
}

export interface PdfSplitTask {
  operation: 'pdf/split';
  input: string;
  ranges: string[];
}

export interface PdfMergeTask {
  operation: 'pdf/merge';
  input: string[];
}

export interface PdfEncryptTask {
  operation: 'pdf/encrypt';
  input: string;
  password: string;
}

export interface PdfDecryptTask {
  operation: 'pdf/decrypt';
  input: string;
  password: string;
}

export interface PdfRotateTask {
  operation: 'pdf/rotate';
  input: string;
  angle: 90 | 180 | 270;
  pages?: number[];
}

export interface PdfCompressTask {
  operation: 'pdf/compress';
  input: string;
}

export interface PdfExtractPagesTask {
  operation: 'pdf/extract-pages';
  input: string;
  pages: number[];
}

export interface PdfWatermarkTask {
  operation: 'pdf/watermark';
  input: string;
  text: string;
  /** 0 to 1. */
  opacity?: number;
}

export interface ExportUrlTask {
  operation: 'export/url';
  input: string;
}

export interface ExportUploadTask {
  operation: 'export/upload';
  input: string;
  url: string;
  headers?: Record<string, string>;
}

export interface ExportS3Task {
  operation: 'export/s3';
  input: string;
  bucket: string;
  key: string;
  region?: string;
  endpoint?: string;
  access_key_id: string;
  secret_access_key: string;
}

export interface ExportAzureTask {
  operation: 'export/azure';
  input: string;
  storage_account: string;
  container: string;
  blob: string;
  sas_token: string;
}

export interface ExportGcsTask {
  operation: 'export/gcs';
  input: string;
  bucket: string;
  key: string;
  project_id?: string;
  credentials?: Record<string, unknown>;
}

export interface ExportSftpTask {
  operation: 'export/sftp';
  input: string;
  host: string;
  port?: number;
  username: string;
  password?: string;
  private_key?: string;
  path: string;
}

export type TaskDefinition =
  | ImportUrlTask
  | ImportUploadTask
  | ImportBase64Task
  | ImportRawTask
  | ConvertTask
  | OptimizeTask
  | CompressTask
  | MergeTask
  | ThumbnailTask
  | MetadataReadTask
  | CaptureWebsiteTask
  | ArchiveCreateTask
  | ArchiveExtractTask
  | CropTask
  | TrimTask
  | PdfOcrTask
  | PdfSplitTask
  | PdfMergeTask
  | PdfEncryptTask
  | PdfDecryptTask
  | PdfRotateTask
  | PdfCompressTask
  | PdfExtractPagesTask
  | PdfWatermarkTask
  | ExportUrlTask
  | ExportUploadTask
  | ExportS3Task
  | ExportAzureTask
  | ExportGcsTask
  | ExportSftpTask;

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface CreateJobRequest {
  tasks: Record<string, TaskDefinition>;
  tag?: string;
  webhook_url?: string;
}

export interface ListJobsParams {
  status?: JobStatus;
  tag?: string;
  limit?: number;
  offset?: number;
}

/** Body of every Jobs API response with a status of 400 or above. */
export interface ApiErrorBody {
  success: false;
  error: ApiErrorDetail;
}

export interface WebhookSecret {
  secret: string;
  algorithm: 'HMAC-SHA256';
  header: string;
  format: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: ApiErrorDetail;
  meta?: {
    total: number;
    limit: number;
    offset: number;
  };
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: unknown;
}

// ============================================================================
// Format Types
// ============================================================================

export interface Format {
  id: string;
  name: string;
  category: 'video' | 'audio' | 'image' | 'document';
  extension: string;
  mime_types: string[];
}

export interface FormatOption {
  name: string;
  type: 'string' | 'number' | 'boolean';
  description: string;
  enum?: string[];
  default?: string | number | boolean;
  min?: number;
  max?: number;
}

export interface FormatConversionOptions {
  input_format: string;
  output_format: string;
  options: FormatOption[];
}

// ============================================================================
// Webhook Types
// ============================================================================

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  secret?: string;
  active: boolean;
  created_at: string;
  updated_at?: string;
  metadata?: Record<string, string>;
}

export interface CreateWebhookRequest {
  url: string;
  events: string[];
  secret?: string;
  metadata?: Record<string, string>;
}

// ============================================================================
// Client Options
// ============================================================================

export interface ClientOptions {
  apiKey: string;
  baseUrl?: string;
  sandbox?: boolean;
  timeout?: number;
  headers?: Record<string, string>;
}

export interface WaitForJobOptions {
  interval?: number;
  timeout?: number;
}

// ============================================================================
// Quick Convert Types
// ============================================================================

export interface QuickConvertOptions {
  /**
   * Source filename WITH its extension (e.g. `clip.mov`).
   *
   * Required unless the uploaded value is a `File` (which carries its own
   * name): the API derives the source format from this extension, so an
   * extension-less upload is rejected with `UNSUPPORTED_CONVERSION`.
   * Consumed by the SDK — never sent as a conversion field.
   */
  filename?: string;
  quality?: string;
  resolution?: string;
  fps?: number;
  width?: number;
  height?: number;
  fit?: string;
  [key: string]: unknown;
}

/**
 * Payload of `GET /v1/status/{jobId}` — the status endpoint for quick-convert
 * jobs (`convert`, `uploadFile`, `importFromUrl`, `convertFromStorage`).
 * Returned bare, with no `{ success, data }` envelope.
 */
export interface ConversionStatus {
  jobId: string;
  /** Queue/DB state: waiting | delayed | active | completed | failed | expired | … */
  status: string;
  progress?: number;
  sourceFormat?: string;
  targetFormat?: string;
  createdAt?: string;
  queuePosition?: number;
  estimatedWaitSeconds?: number;
  isPriority?: boolean;
  result?: {
    /** Path relative to the API origin, e.g. `/v1/download/{jobId}`. */
    downloadUrl: string;
    outputSize?: number;
    duration?: number;
    outputFormat?: string;
    warnings?: string[];
  };
  error?: string;
}

export interface ImportFromUrlOptions {
  filename?: string;
  headers?: Record<string, string>;
  targetFormat: string;
  [key: string]: unknown;
}

// ============================================================================
// PDF Operation Types
// ============================================================================

export interface PdfOcrOptions {
  file: string;
  language?: string;
}

export interface PdfSplitOptions {
  file: string;
  ranges: string[];
}

export interface PdfMergeOptions {
  files: string[];
}

export interface PdfEncryptOptions {
  file: string;
  password: string;
}

export interface PdfDecryptOptions {
  file: string;
  password: string;
}

export interface PdfRotateOptions {
  file: string;
  angle: 90 | 180 | 270;
  pages?: number[];
}

export interface PdfCompressOptions {
  file: string;
}

export interface PdfToPdfaOptions {
  file: string;
}

export interface PdfExtractPagesOptions {
  file: string;
  pages: number[];
}

export interface PdfWatermarkOptions {
  file: string;
  text: string;
  /** 0 to 1. */
  opacity?: number;
}

export interface PdfOperationResult {
  url: string;
  file_size: number;
  page_count?: number;
}

// ============================================================================
// Presigned Upload Types
// ============================================================================

export interface PresignUploadRequest {
  filename: string;
  contentType?: string;
  fileSize?: number;
}

export interface PresignUploadResponse {
  uploadUrl: string;
  storageKey: string;
  filename: string;
  contentType: string;
  expiresIn: number;
  maxFileSize: number;
  maxFileSizeMB: number;
}

export interface StorageConvertRequest {
  storageKey: string;
  sourceFormat: string;
  targetFormat: string;
  originalName?: string;
  toolOperation?: string;
  [key: string]: unknown;
}

export interface StorageConvertResponse {
  jobId: string;
  status: string;
  statusUrl: string;
  realtimeUrl: string;
  sseUrl: string;
  sourceFormat: string;
  targetFormat: string;
  storageKey: string;
}

// ============================================================================
// Real-time Job Update Types
// ============================================================================

export type JobUpdateType = 'started' | 'progress' | 'completed' | 'failed';

export interface JobUpdate {
  type: JobUpdateType;
  jobId: string;
  timestamp: string;
  progress?: number;
  status?: string;
  error?: string;
  outputUrl?: string;
  outputSize?: number;
  duration?: number;
}

export interface StreamJobOptions {
  /** Abort signal to cancel the stream */
  signal?: AbortSignal;
}
