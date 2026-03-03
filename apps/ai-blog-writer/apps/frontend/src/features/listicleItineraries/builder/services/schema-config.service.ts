const normalizeText = (value: string | undefined): string | undefined => {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

const isValidAbsoluteHttpUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export type ItinerarySchemaPublisherConfig = {
  siteName?: string
  logoUrl?: string
  defaultAuthorName?: string
}

export function getItinerarySchemaPublisherConfig(): ItinerarySchemaPublisherConfig {
  const siteName = normalizeText(import.meta.env.VITE_SCHEMA_SITE_NAME)
  const defaultAuthorName = normalizeText(import.meta.env.VITE_SCHEMA_DEFAULT_AUTHOR_NAME)
  const rawLogoUrl = normalizeText(import.meta.env.VITE_SCHEMA_PUBLISHER_LOGO_URL)
  const logoUrl = rawLogoUrl && isValidAbsoluteHttpUrl(rawLogoUrl) ? rawLogoUrl : undefined

  return {
    siteName,
    logoUrl,
    defaultAuthorName,
  }
}
