import { ApiError } from '../errors/api-error';
import { ERROR_CODES } from '../errors/error-codes';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

export function resolveLimit(limit?: number): number {
  if (limit === undefined) {
    return DEFAULT_PAGE_SIZE;
  }
  if (limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Limite de pagination invalide.', {
      max: MAX_PAGE_SIZE,
    });
  }
  return limit;
}

export function encodeCursor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor<T>(cursor?: string): T | null {
  if (!cursor) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as T;
  } catch {
    throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Curseur de pagination invalide.');
  }
}

export function buildPage<T>(items: T[], limit: number, cursorOf: (item: T) => string): Page<T> {
  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;
  return {
    data: pageItems,
    nextCursor: hasMore ? cursorOf(pageItems[pageItems.length - 1]) : null,
  };
}
