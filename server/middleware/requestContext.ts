import crypto from 'node:crypto';
import type {NextFunction, Request, Response} from 'express';
import {AppError} from '../core/errors.ts';
import {logger} from '../core/logger.ts';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.header('x-request-id');
  const requestId = incomingId && incomingId.trim().length > 0 ? incomingId.trim() : crypto.randomUUID();
  const startNs = process.hrtime.bigint();

  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startNs) / 1_000_000;
    if (req.path.startsWith('/api')) {
      logger.info('HTTP request completed', {
        component: 'http-gateway',
        requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
      });
    }
  });

  next();
}

export function errorHandlerMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.requestId || 'unknown';

  if (err instanceof AppError) {
    logger.warn(err.message, {
      component: 'error-handler',
      requestId,
      code: err.code,
      statusCode: err.statusCode,
    });
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details ?? null,
        requestId,
      },
    });
    return;
  }

  const message = err instanceof Error ? err.message : 'Unexpected server error';
  logger.error('Unhandled server exception', {
    component: 'error-handler',
    requestId,
    error: message,
  });

  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An internal error occurred. Inspect server logs with requestId.',
      requestId,
    },
  });
}
