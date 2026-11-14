import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Check a delivery to a job's `webhook_url`.
 *
 * @param rawBody   The request body exactly as received (string or Buffer), before any JSON parsing.
 * @param signature The `X-ConvertIntoMP4-Signature` header value (`sha256=<hex>`).
 * @param secret    From `client.getJobWebhookSecret()`.
 * @param toleranceSeconds Reject events whose `timestamp` is older than this (default 300). Pass 0 to skip.
 */
export function verifyJobWebhook(
  rawBody: string | Buffer,
  signature: string,
  secret: string,
  toleranceSeconds = 300,
): boolean {
  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const expected = Buffer.from('sha256=' + createHmac('sha256', secret).update(body).digest('hex'));
  const given = Buffer.from(signature ?? '');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  if (toleranceSeconds > 0) {
    try {
      const ts = Date.parse((JSON.parse(body) as { timestamp?: string }).timestamp ?? '');
      if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > toleranceSeconds * 1000) return false;
    } catch {
      return false;
    }
  }
  return true;
}
