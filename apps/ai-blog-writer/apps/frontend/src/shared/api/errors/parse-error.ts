export async function parseError(response: Response, fallback: string): Promise<Error> {
  const errorData = await response.json().catch(() => ({ detail: fallback }))
  const detail =
    (typeof errorData?.detail === 'string' && errorData.detail) ||
    (typeof errorData?.message === 'string' && errorData.message) ||
    fallback
  return new Error(detail)
}
