import type { SeoMetadataForm } from '../../types'

export function createEmptySeoForm(): SeoMetadataForm {
  return {
    metaTitle: '',
    metaDescription: '',
    keywords: '',
    ogTitle: '',
    ogDescription: '',
    ogImage: null,
    canonicalUrl: '',
    noIndex: false,
    noFollow: false,
    status: 'draft',
  }
}

export function normalizeSeoPayload(form: SeoMetadataForm): SeoMetadataForm {
  const normalizeText = (value: string): string => value.trim()
  const metaDescription = normalizeText(form.metaDescription)
  const ogDescription = normalizeText(form.ogDescription)

  return {
    ...form,
    metaTitle: normalizeText(form.metaTitle),
    metaDescription: metaDescription.length >= 50 ? metaDescription : '',
    keywords: normalizeText(form.keywords),
    ogTitle: normalizeText(form.ogTitle),
    ogDescription,
    canonicalUrl: normalizeText(form.canonicalUrl),
  }
}
