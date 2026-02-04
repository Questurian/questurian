export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly code?: string;
  public readonly details?: unknown;

  constructor(
    statusCode: number,
    message: string,
    code?: string,
    details?: unknown
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.name = this.constructor.name;
    const ErrorWithCapture = Error as ErrorConstructor & {
      captureStackTrace?: (targetObject: object, constructorOpt?: Function) => void;
    };
    if (typeof ErrorWithCapture.captureStackTrace === "function") {
      ErrorWithCapture.captureStackTrace(this, this.constructor);
    }
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string, details?: unknown) {
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
  public readonly errors: unknown[];

  constructor(message: string, errors: unknown[]) {
    super(400, message, "VALIDATION_ERROR", { errors });
    this.errors = errors;
  }
}

export class InternalServerError extends HttpError {
  constructor(message: string = "Internal server error", details?: unknown) {
    super(500, message, "INTERNAL_ERROR", details);
  }
}

export class ServiceUnavailableError extends HttpError {
  constructor(service: string) {
    super(503, `${service} is not configured or unavailable`, "SERVICE_UNAVAILABLE");
  }
}
