const LOCAL_PUBLIC_BASE_URL = 'http://localhost:3000'
const PRODUCTION_PUBLIC_BASE_URL = 'https://www.questurian.com'

export function getPublicBaseUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_FRONTEND_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ''
  const fallback =
    process.env.NODE_ENV === 'production' ? PRODUCTION_PUBLIC_BASE_URL : LOCAL_PUBLIC_BASE_URL

  return (configured.trim() || fallback).replace(/\/+$/, '')
}
