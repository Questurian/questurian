import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/shared/config', () => ({
  APP_CONFIG: {
    CORS_ORIGINS: ['http://localhost:3000', 'https://app.example.com'],
  },
}))

import { getCorsHeaders } from './cors'

function requestWithOrigin(origin?: string) {
  return new NextRequest('http://localhost:4000/api/health', {
    headers: origin ? { origin } : {},
  })
}

describe('getCorsHeaders', () => {
  it('reflects an allowed origin with credentials', () => {
    const headers = getCorsHeaders(requestWithOrigin('https://app.example.com'))

    expect(headers['Access-Control-Allow-Origin']).toBe('https://app.example.com')
    expect(headers['Access-Control-Allow-Credentials']).toBe('true')
    expect(headers['Vary']).toBe('Origin')
  })

  it('omits Access-Control-Allow-Origin for disallowed origins', () => {
    const headers = getCorsHeaders(requestWithOrigin('https://evil.example.com'))

    expect(headers).not.toHaveProperty('Access-Control-Allow-Origin')
    expect(headers).not.toHaveProperty('Access-Control-Allow-Credentials')
  })

  it('omits Access-Control-Allow-Origin when no origin header is present', () => {
    const headers = getCorsHeaders(requestWithOrigin())

    expect(headers).not.toHaveProperty('Access-Control-Allow-Origin')
    expect(headers).not.toHaveProperty('Access-Control-Allow-Credentials')
  })
})
