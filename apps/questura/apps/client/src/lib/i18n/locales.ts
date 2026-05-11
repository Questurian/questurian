export const SUPPORTED_LOCALES = ['en'] as const

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: SupportedLocale = 'en'

export const SUPPORTED_LOCALES_SET: ReadonlySet<string> = new Set(SUPPORTED_LOCALES)

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && SUPPORTED_LOCALES_SET.has(value)
}
