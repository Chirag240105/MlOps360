export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR', details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier: string) {
    super(`${resource} '${identifier}' was not found`, 404, 'NOT_FOUND', {resource, identifier});
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 409, 'CONFLICT_ERROR', details);
  }
}

export class PolicyViolationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, 'POLICY_VIOLATION', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions for this operation', details?: unknown) {
    super(message, 403, 'FORBIDDEN', details);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded. Retry later.') {
    super(message, 429, 'RATE_LIMITED');
  }
}
