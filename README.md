# convertintomp4

Official Node.js/TypeScript SDK for the [ConvertIntoMP4](https://convertintomp4.com) file conversion API: 270+ formats across video, audio, image, document, archive, and font conversion, backed by 13 specialized conversion engines.

- **API docs:** [convertintomp4.com/api-docs](https://convertintomp4.com/api-docs)
- **Measured performance:** [convertintomp4.com/reports/benchmarks](https://convertintomp4.com/reports/benchmarks). In the July 2026 run against the production API, a 22 MB 30-second 1080p MOV converted to MP4 in **4.0 seconds** of server processing time, and all 20 benchmark cases produced format-validated output. Raw data: [benchmark-study.json](https://convertintomp4.com/benchmark-study.json).

## Installation

```bash
npm install convertintomp4
```

## Requirements

- Node.js 18+ (uses the native `fetch` API; no runtime dependencies)

## Quick Start

Get an API key from your [ConvertIntoMP4 dashboard](https://convertintomp4.com/account/api/keys), then:

```typescript
import { readFileSync, writeFileSync } from 'node:fs';
import { ConvertIntoMP4Client } from 'convertintomp4';

const client = new ConvertIntoMP4Client({ apiKey: 'ck_your_api_key' });

// 1. Upload + convert in one call.
//    `filename` is required (unless you pass a `File`): the API reads the
//    SOURCE format off its extension.
const { jobId } = await client.convert(
  readFileSync('clip.mov'),
  'mp4',
  { filename: 'clip.mov' },
);

// 2. Wait for the job to finish (polls GET /v1/status/{jobId})
const job = await client.waitForJob(jobId, { interval: 2000, timeout: 300000 });

// 3. Download the result
if (job.status === 'completed') {
  const response = await client.downloadFile(jobId);
  writeFileSync('clip.mp4', Buffer.from(await response.arrayBuffer()));
}
```

The same three calls handle any supported pair. Popular conversions:

| Conversion | Try it in the browser |
| --- | --- |
| MOV → MP4 | [convertintomp4.com/mov-to-mp4](https://convertintomp4.com/mov-to-mp4) |
| MP4 → MP3 | [convertintomp4.com/mp4-to-mp3](https://convertintomp4.com/mp4-to-mp3) |
| WEBM → MP4 | [convertintomp4.com/webm-to-mp4](https://convertintomp4.com/webm-to-mp4) |
| PDF → Word | [convertintomp4.com/pdf-to-word](https://convertintomp4.com/pdf-to-word) |
| HEIC → JPG | [convertintomp4.com/heic-to-jpg](https://convertintomp4.com/heic-to-jpg) |

## Configuration

```typescript
const client = new ConvertIntoMP4Client({
  apiKey: 'ck_your_api_key',
  baseUrl: 'https://api.convertintomp4.com/v1', // default
  sandbox: false, // true = send X-Sandbox: 1 MB files, 100 POSTs a month per key, counts toward your plan
  timeout: 30000, // per-request timeout in ms
});
```

## Usage

### Quick Convert (file upload)

```typescript
import { readFileSync } from 'node:fs';

const result = await client.convert(readFileSync('input.mp4'), 'mp3', {
  filename: 'input.mp4',
  quality: 'high',
});
// result: { jobId, status, statusUrl }
```

`filename` must carry the real source extension: the API derives the source
format from it, and an extension-less upload is rejected with
`UNSUPPORTED_CONVERSION`. Pass a `File` instead and its `name` is used
automatically.

### Job status

Quick-convert jobs (`convert`, `uploadFile`, `importFromUrl`,
`convertFromStorage`) return a bare 12-character `jobId` that lives in the
conversion queue, not in the Jobs API store. Poll them at
`GET /v1/status/{jobId}`:

```typescript
const status = await client.getConversionStatus(jobId);
// { jobId, status: 'waiting' | 'active' | 'completed' | 'failed' | …,
//   progress, result?: { downloadUrl, outputSize, outputFormat } }
```

`waitForJob(jobId)` picks the right endpoint automatically: `/v1/status/{id}`
for quick-convert ids, `/v1/jobs/{id}` for `job_…` pipeline ids from
`createJob`.

### Import from URL

```typescript
const result = await client.importFromUrl('https://example.com/video.mov', {
  targetFormat: 'mp4',
});
```

### Job-Based Conversion (task pipelines)

Multi-step jobs with named tasks, mirroring the [Jobs API](https://convertintomp4.com/api-docs):

```typescript
const job = await client.createJob({
  tasks: {
    'import-file': {
      operation: 'import/url',
      url: 'https://example.com/video.mov',
    },
    'convert': {
      operation: 'convert',
      input: 'import-file',
      output_format: 'mp4',
      options: { quality: 'high', resolution: '1080p' },
    },
    'export': {
      operation: 'export/url',
      input: 'convert',
    },
  },
});

const completed = await client.waitForJob(job.id, {
  interval: 2000,
  timeout: 120000,
});
console.log('Status:', completed.status);
```

### List and Manage Jobs

```typescript
const { data: jobs, meta } = await client.listJobs({ status: 'completed', limit: 10 });

const job = await client.getJob('job_abc123');
await client.deleteJob('job_abc123');
await client.cancelJob('job_abc123');
await client.retryJob('job_abc123');
```

### Formats

```typescript
const formats = await client.listFormats();          // all formats
const videoFormats = await client.listFormats('video'); // by category
const options = await client.getFormatOptions('mov', 'mp4');
```

### Webhooks

```typescript
const webhook = await client.createWebhook(
  'https://your-app.com/webhook',
  ['job.completed', 'job.failed'],
  { secret: 'your-webhook-secret' },
);

const webhooks = await client.listWebhooks();
await client.deleteWebhook(webhook.id);
```

### PDF Operations

PDF work goes through `convert()` with a `toolOperation`. The `pdf*` methods on
this client call `/v1/pdf/*`, which the API retired on 2026-07-26; those
endpoints took a file URL but the engines only read uploaded files, so they
never worked and now answer `400 PDF_ENDPOINT_NOT_SUPPORTED`. The methods are
kept only so existing code surfaces that message; they will be removed in the
next major version.

```typescript
import { readFileSync } from 'node:fs';

// OCR a scanned PDF
const { jobId } = await client.convert(readFileSync('scan.pdf'), 'pdf', {
  filename: 'scan.pdf',
  toolOperation: 'ocr-pdf',
  language: 'eng',
});
const job = await client.waitForJob(jobId, { interval: 2000 });
```

| Operation | `toolOperation` | Key options |
| --- | --- | --- |
| Compress | `compress-pdf` | `pdfQuality=screen\|ebook\|printer\|prepress` |
| Split | `split-pdf` | `pages=1-5` |
| Rotate | `rotate-pdf` | `rotate=90`, `pages=2,4` |
| Encrypt | `encrypt-pdf` | `password` |
| Decrypt | `decrypt-pdf` | `password` |
| OCR | `ocr-pdf` | `language=eng` (17 language packs) |
| PDF/A | `to-pdfa` | `pdfaVersion=1b\|2b\|3b` |
| Extract pages | `extract-pdf-pages` | `pages=1,3,5` |
| Watermark | `add-watermark-pdf` | `watermarkText`, `watermarkPosition`, `watermarkOpacity` |

Merging uses the dedicated multipart endpoint `POST /v1/convert/merge`
(two or more `file` parts plus `mergeType=pdf`).

## Error Handling

```typescript
import {
  ConvertIntoMP4Client,
  ApiError,
  AuthenticationError,
  RateLimitError,
  TimeoutError,
} from 'convertintomp4';

try {
  const job = await client.getJob('invalid-id');
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Invalid API key');
  } else if (error instanceof RateLimitError) {
    console.error(`Rate limited. Retry after ${error.retryAfter}s`);
  } else if (error instanceof TimeoutError) {
    console.error('Request timed out');
  } else if (error instanceof ApiError) {
    console.error(`API error ${error.statusCode}: ${error.code} - ${error.message}`);
  }
}
```

## TypeScript Support

Written in TypeScript with full type definitions for every request and response.

```typescript
import type { Job, Task, Format, Webhook, CreateJobRequest } from 'convertintomp4';
```

## Links

- [API documentation](https://convertintomp4.com/api-docs)
- [Measured benchmarks](https://convertintomp4.com/reports/benchmarks) ([raw JSON](https://convertintomp4.com/benchmark-study.json))
- [Pricing](https://convertintomp4.com/pricing)
- [All supported conversions](https://convertintomp4.com/tools)

## License

MIT
