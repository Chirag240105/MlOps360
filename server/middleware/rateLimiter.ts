import type {NextFunction, Request, Response} from 'express';
import {RateLimitError} from '../core/errors.ts';

export function createRateLimiter(maxRequests: number, windowMs = 60_000) {
  const hits = new Map<string, number[]>();

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.path.startsWith('/api')) {
      return next();
    }
    const key = req.ip || 'global';
    const now = Date.now();
    const cutoff = now - windowMs;
    const timestamps = (hits.get(key) ?? []).filter((t) => t > cutoff);

    if (timestamps.length >= maxRequests) {
      res.setHeader('X-RateLimit-Limit', String(maxRequests));
      res.setHeader('X-RateLimit-Remaining', '0');
      return next(new RateLimitError());
    }

    timestamps.push(now);
    hits.set(key, timestamps);
    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, maxRequests - timestamps.length)));
    next();
  };
}
