import { Request, Response } from 'express';
import { randomUUID } from 'crypto';

export interface ContextualRequest extends Request {
  requestId?: string;
}

export function requestContextMiddleware(
  request: ContextualRequest,
  response: Response,
  next: () => void,
): void {
  const header = request.headers['x-request-id'];
  const requestId =
    typeof header === 'string' && header.length > 0 && header.length <= 128 ? header : randomUUID();
  request.requestId = requestId;
  response.setHeader('X-Request-Id', requestId);
  next();
}
