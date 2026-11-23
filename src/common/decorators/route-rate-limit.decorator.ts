import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'route-rate-limit';

export interface RouteRateLimitOptions {
  max: number | string;
  windowSeconds?: number | string;
}

export const RouteRateLimit = (options: RouteRateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);
