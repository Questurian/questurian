function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function extractDetailMessage(errorData: unknown, fallback: string): string {
  if (!isRecord(errorData)) return fallback

  const detail = errorData.detail
  if (typeof detail === 'string') {
    return detail
  }
  if (isRecord(detail) && typeof detail.message === 'string') {
    return detail.message
  }
  if (typeof errorData.message === 'string' && errorData.message) {
    return errorData.message
  }
  return fallback
}

export async function parseErrorResponse(
  response: Response,
  fallback: string,
  fallbackErrorBody: unknown = { detail: { message: fallback } },
): Promise<string> {
  const errorData = await response.json().catch(() => fallbackErrorBody)
  return extractDetailMessage(errorData, fallback)
}
