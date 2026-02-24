import { API_URL } from '../client/imageApiClient';

interface StructuredPayloadError {
  step?: string;
  message?: string;
  detail?: string;
  status_code?: number;
  request_url?: string;
  response_body?: string;
}

interface StructuredApiErrorDetail {
  message?: string;
  step?: string;
  detail?: string;
  failed_variant?: string;
  payload_error?: StructuredPayloadError;
}

interface ErrorResponseBody {
  detail?: string | StructuredApiErrorDetail;
  message?: string;
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function formatStructuredError(
  detail: StructuredApiErrorDetail,
  fallback: string
): string {
  const message = normalizeText(detail.message || fallback);
  const step = detail.step || detail.payload_error?.step;
  const reason = normalizeText(detail.detail || detail.payload_error?.detail || '');
  const failedVariant = detail.failed_variant;
  const payloadStatus = detail.payload_error?.status_code;

  const segments = [message];
  if (step) segments.push(`step: ${step}`);
  if (failedVariant) segments.push(`variant: ${failedVariant}`);
  if (reason && reason !== message) segments.push(reason);
  if (payloadStatus) segments.push(`Payload HTTP ${payloadStatus}`);

  return segments.join(' | ');
}

export async function parseErrorMessage(
  response: Response,
  fallbackMessage: string
): Promise<string> {
  const bodyText = await response.text().catch(() => '');
  const fallback = `${fallbackMessage} (HTTP ${response.status})`;

  if (!bodyText) {
    return fallback;
  }

  let body: ErrorResponseBody | null = null;
  try {
    body = JSON.parse(bodyText) as ErrorResponseBody;
  } catch {
    body = null;
  }

  if (body) {
    if (typeof body.detail === 'string' && body.detail.trim()) {
      return normalizeText(body.detail);
    }
    if (isRecord(body.detail)) {
      return formatStructuredError(body.detail as StructuredApiErrorDetail, fallback);
    }
    if (typeof body.message === 'string' && body.message.trim()) {
      return normalizeText(body.message);
    }
    if (typeof body.error === 'string' && body.error.trim()) {
      return normalizeText(body.error);
    }
  }

  const cleanText = normalizeText(bodyText);
  if (!cleanText || cleanText.startsWith('<')) {
    return fallback;
  }

  if (cleanText.length > 300) {
    return `${cleanText.slice(0, 300)}...`;
  }

  return cleanText;
}

export function normalizeRequestError(
  error: unknown,
  fallbackMessage: string
): Error {
  if (error instanceof TypeError && /fetch/i.test(error.message)) {
    return new Error(
      `Cannot reach image API at ${API_URL}. Check that the backend is running.`
    );
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(fallbackMessage);
}
