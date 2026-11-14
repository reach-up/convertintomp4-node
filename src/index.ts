export { ConvertIntoMP4Client } from './client.js';
export {
  ConvertIntoMP4Error,
  ApiError,
  AuthenticationError,
  RateLimitError,
  TimeoutError,
} from './client.js';

export type {
  // Core types
  Job,
  Task,
  TaskResult,
  TaskResultFile,
  JobStatus,
  TaskStatus,
  TaskOperation,

  // Task definitions
  TaskDefinition,
  ImportUrlTask,
  ImportUploadTask,
  ImportBase64Task,
  WebhookSecret,
  ApiErrorBody,
  ImportRawTask,
  ConvertTask,
  ConversionOptions,
  OptimizeTask,
  CompressTask,
  MergeTask,
  ThumbnailTask,
  MetadataReadTask,
  CaptureWebsiteTask,
  ArchiveCreateTask,
  ArchiveExtractTask,
  CropTask,
  TrimTask,
  PdfOcrTask,
  PdfSplitTask,
  PdfMergeTask,
  PdfEncryptTask,
  PdfDecryptTask,
  PdfRotateTask,
  PdfCompressTask,
  PdfExtractPagesTask,
  PdfWatermarkTask,
  ExportUrlTask,
  ExportUploadTask,
  ExportS3Task,
  ExportAzureTask,
  ExportGcsTask,
  ExportSftpTask,

  // Request/Response types
  CreateJobRequest,
  ListJobsParams,
  ApiResponse,
  ApiErrorDetail,

  // Format types
  Format,
  FormatOption,
  FormatConversionOptions,

  // Webhook types
  Webhook,
  CreateWebhookRequest,

  // Client types
  ClientOptions,
  WaitForJobOptions,
  QuickConvertOptions,
  ConversionStatus,
  ImportFromUrlOptions,

  // PDF types
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

  // Presigned upload types
  PresignUploadRequest,
  PresignUploadResponse,
  StorageConvertRequest,
  StorageConvertResponse,

  // Real-time streaming types
  JobUpdate,
  JobUpdateType,
  StreamJobOptions,
} from './types.js';

export { verifyJobWebhook } from './webhooks.js';
