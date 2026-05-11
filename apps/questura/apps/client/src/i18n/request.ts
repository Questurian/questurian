import { getRequestConfig } from 'next-intl/server'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'

export default getRequestConfig(async () => {
  const locale = DEFAULT_LOCALE
  const messages = (await import(`../../messages/${locale}.json`)).default
  return {
    locale,
    messages,
  }
})
