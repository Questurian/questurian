export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string, details?: any) {
    super(400, message, "BAD_REQUEST", details);
  }
}

export class NotFoundError extends HttpError {
  constructor(resource: string, identifier?: string | number) {
    const message = identifier
      ? `${resource} with identifier ${identifier} not found`
      : `${resource} not found`;
    super(404, message, "NOT_FOUND");
  }
}

export class ValidationError extends HttpError {
  constructor(message: string, public readonly errors: any[]) {
    super(400, message, "VALIDATION_ERROR", { errors });
  }
}

export class InternalServerError extends HttpError {
  constructor(message: string = "Internal server error", details?: any) {
    super(500, message, "INTERNAL_ERROR", details);
  }
}

export class ServiceUnavailableError extends HttpError {
  constructor(service: string) {
    super(503, `${service} is not configured or unavailable`, "SERVICE_UNAVAILABLE");
  }
}
