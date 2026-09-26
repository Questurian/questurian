import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { UNIDENTIFIED_CLIENT_ADDRESS, VISITOR_AUTH_CLIENT_IP_HEADER, withClientIdentity } from './client-identity'

const URL_SIGN_IN = 'https://api.questurian.test/api/visitor-auth/sign-in/email'

describe('withClientIdentity', () => {
  it('keeps the method, address, headers and body of a sign-in', async () => {
    const request = new NextRequest(URL_SIGN_IN, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://www.questurian.test' },
      body: JSON.stringify({ email: 'reader@example.com', password: 'correct horse' }),
    })

    const copy = withClientIdentity(request)

    expect(copy.method).toBe('POST')
    expect(copy.url).toBe(URL_SIGN_IN)
    expect(copy.headers.get('content-type')).toBe('application/json')
    expect(copy.headers.get('origin')).toBe('https://www.questurian.test')
    await expect(copy.json()).resolves.toEqual({ email: 'reader@example.com', password: 'correct horse' })
  })

  it('writes its own client header over whatever the caller sent', () => {
    const request = new NextRequest(URL_SIGN_IN, {
      method: 'POST',
      headers: { [VISITOR_AUTH_CLIENT_IP_HEADER]: '203.0.113.9' },
      body: '{}',
    })

    expect(withClientIdentity(request).headers.get(VISITOR_AUTH_CLIENT_IP_HEADER)).toBe(UNIDENTIFIED_CLIENT_ADDRESS)
  })

  it('gives a GET no body', async () => {
    const copy = withClientIdentity(new NextRequest('https://api.questurian.test/api/visitor-auth/get-session'))

    expect(copy.method).toBe('GET')
    expect(copy.body).toBeNull()
  })
})
