/**
 * Public origin for in-app redirects. Always the host the visitor is on,
 * so localhost stays localhost and www stays www.
 */
export function originFromRequest(input: {
  host: string | null | undefined
  forwardedHost?: string | null
  forwardedProto?: string | null
  urlOrigin: string
}): string {
  const host = (input.forwardedHost || input.host || '').trim()
  const fallback = input.urlOrigin.replace(/\/+$/, '')
  if (!host) return fallback

  const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1')
  const forwarded = (input.forwardedProto || '').trim().replace(/:$/, '')
  const fromUrl = (() => {
    try {
      return new URL(fallback).protocol.replace(/:$/, '')
    } catch {
      return ''
    }
  })()
  const proto = forwarded || (isLocal ? 'http' : fromUrl || 'https')

  return `${proto}://${host}`.replace(/\/+$/, '')
}
