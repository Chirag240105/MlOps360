import type {NextFunction, Request, Response} from 'express';
import {ForbiddenError, UnauthorizedError} from '../core/errors.ts';
import {verifyJwt, type JwtPayload, type UserRole} from '../core/security.ts';

declare global {
  namespace Express {
    interface Request {
      principal?: JwtPayload;
    }
  }
}

export function extractBearerToken(req: Request): string | null {
  const authHeader = req.header('authorization');
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new UnauthorizedError('Authorization header must use Bearer <token>');
  }
  return token;
}

export function createPrincipalMiddleware(jwtSecret: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const token = extractBearerToken(req);
      if (token) {
        req.principal = verifyJwt(token, jwtSecret);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireAuth(strict = true) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (strict && !req.principal) {
      return next(new UnauthorizedError('Bearer token required'));
    }
    next();
  };
}

export function requireRole(allowedRoles: UserRole[], enforceWhenAnonymous = false) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.principal) {
      if (enforceWhenAnonymous) {
        return next(new UnauthorizedError('Authentication required'));
      }
      return next();
    }
    if (!allowedRoles.includes(req.principal.role)) {
      return next(
        new ForbiddenError(`Role '${req.principal.role}' is not authorized for this action`, {
          requiredRoles: allowedRoles,
        }),
      );
    }
    next();
  };
}
