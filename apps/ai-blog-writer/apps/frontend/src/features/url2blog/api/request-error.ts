function formatDetail(detail: unknown): string | null {
  if (typeof detail === 'string') {
    return detail
  }

  if (Array.isArray(detail)) {
    const items = detail
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }
        if (item && typeof item === 'object' && 'msg' in item && typeof item.msg === 'string') {
          return item.msg
        }
        return null
      })
      .filter((item): item is string => Boolean(item))
    return items.length > 0 ? items.join('; ') : null
  }

  return null
}

export async function resolveErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json()
    return formatDetail(payload?.detail) || fallback
  } catch {
    return fallback
  }
}
