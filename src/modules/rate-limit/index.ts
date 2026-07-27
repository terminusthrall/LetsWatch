import { NextRequest } from 'next/server';
import { Ratelimit, type Duration } from '@upstash/ratelimit';
import { redis } from '@/modules/redis';

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() ?? 'anonymous';
}

const limiters = new Map<string, Ratelimit>();

function getLimiter(requests: number, window: string): Ratelimit {
  const key = `${requests}:${window}`;
  if (limiters.has(key)) {
    return limiters.get(key)!;
  }

  const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window as Duration),
    analytics: true,
  });

  limiters.set(key, ratelimit);
  return ratelimit;
}

interface RateLimitInput {
  requests: number;
  window: string;
}

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

export async function checkRateLimit(
  identifier: string,
  limit: RateLimitInput
): Promise<RateLimitResult> {
  const ratelimit = getLimiter(limit.requests, limit.window);
  const result = await ratelimit.limit(identifier);
  return {
    allowed: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
  };
}
