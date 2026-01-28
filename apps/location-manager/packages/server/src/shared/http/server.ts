import { Hono } from 'hono';
import { HttpError } from '../core/errors/http-error';

export const app = new Hono();

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'location-manager-api' });
});

// Global error handler
app.onError((err, c) => {
  console.error("Error:", err);

  if (err instanceof HttpError) {
    return c.json(
      {
        success: false,
        error: err.message,
        code: err.code,
        ...(err.details && { details: err.details })
      },
      err.statusCode as any
    );
  }

  // Handle unknown errors
  const message = err instanceof Error ? err.message : "Unknown error";
  return c.json(
    {
      success: false,
      error: message
    },
    500 as any
  );
});
