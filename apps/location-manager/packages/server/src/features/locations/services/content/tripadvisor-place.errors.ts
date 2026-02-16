export class TripAdvisorPlaceError extends Error {
  status: 400 | 404 | 500;

  constructor(message: string, status: 400 | 404 | 500) {
    super(message);
    this.name = "TripAdvisorPlaceError";
    this.status = status;
  }
}
