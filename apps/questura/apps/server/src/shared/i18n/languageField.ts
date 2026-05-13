import type { Field } from 'payload'

const SUPPORTED_LANGS = ['en'] as const

type SupportedLang = (typeof SUPPORTED_LANGS)[number]

export const DEFAULT_LANG: SupportedLang = 'en'

export function isSupportedLang(value: unknown): value is SupportedLang {
  return typeof value === 'string' && (SUPPORTED_LANGS as readonly string[]).includes(value)
}

export const languageField: Field = {
  name: 'language',
  type: 'select',
  required: true,
  defaultValue: DEFAULT_LANG,
  options: SUPPORTED_LANGS.map((value) => ({
    label: value.toUpperCase(),
    value,
  })),
  index: true,
  admin: {
    position: 'sidebar',
    description: 'Content language. Used for hreflang and per-locale filtering.',
  },
}
