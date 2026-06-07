import { NextRequest, NextResponse } from 'next/server';

type RateBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateBucket>();
const SUPPORTED_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

export function rejectLargeRequest(
  req: NextRequest,
  maxBytes: number
): NextResponse | null {
  const raw = req.headers.get('content-length');
  if (!raw) return null;
  const contentLength = Number(raw);
  if (!Number.isFinite(contentLength)) return null;
  if (contentLength > maxBytes) {
    return NextResponse.json({ error: '요청 본문이 너무 큽니다' }, { status: 413 });
  }
  return null;
}

export function rateLimit(
  req: NextRequest,
  key: string,
  limit: number,
  windowMs: number
): NextResponse | null {
  const now = Date.now();
  const bucketKey = `${key}:${clientKey(req)}`;
  const current = buckets.get(bucketKey);

  if (!current || current.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    cleanupBuckets(now);
    return null;
  }

  if (current.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    return NextResponse.json(
      { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      }
    );
  }

  current.count += 1;
  return null;
}

export function isSupportedImageMime(mimeType: unknown): mimeType is string {
  return typeof mimeType === 'string' && SUPPORTED_IMAGE_MIMES.has(mimeType);
}

function clientKey(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = req.headers.get('x-real-ip')?.trim();
  return forwarded || realIp || 'local';
}

function cleanupBuckets(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}
