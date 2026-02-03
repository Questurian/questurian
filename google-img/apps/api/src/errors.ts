export class HttpError extends Error {
  readonly statusCode: number;
  readonly expose: boolean;

  constructor(statusCode: number, message: string, expose = true) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.expose = expose;
  }
}
