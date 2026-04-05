export function normalizeArticleUrlInput(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const withProtocol =
    trimmed.startsWith('//')
      ? `https:${trimmed}`
      : /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed)
        ? trimmed
        : `https://${trimmed.replace(/^\/+/, '')}`

  try {
    const parsed = new URL(withProtocol)
    if (!/^https?:$/i.test(parsed.protocol)) {
      return null
    }
    if (!parsed.hostname) {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}
