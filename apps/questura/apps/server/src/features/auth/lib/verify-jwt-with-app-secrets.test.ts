import jwt from 'jsonwebtoken'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { tryVerifyJwtWithAppSecrets } from './verify-jwt-with-app-secrets'

describe('tryVerifyJwtWithAppSecrets', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('verifies token signed with JWT_SECRET when it differs from PAYLOAD_SECRET', () => {
    vi.stubEnv('JWT_SECRET', 'custom-secret')
    vi.stubEnv('PAYLOAD_SECRET', 'payload-secret')
    const token = jwt.sign({ id: 99, role: 'admin' }, 'custom-secret')
    const decoded = tryVerifyJwtWithAppSecrets(token)
    expect(decoded?.id).toBe(99)
  })

  it('verifies token signed with PAYLOAD_SECRET when JWT_SECRET is a different value', () => {
    vi.stubEnv('JWT_SECRET', 'custom-secret')
    vi.stubEnv('PAYLOAD_SECRET', 'payload-secret')
    const token = jwt.sign({ id: 42, role: 'user' }, 'payload-secret')
    const decoded = tryVerifyJwtWithAppSecrets(token)
    expect(decoded?.id).toBe(42)
  })

  it('returns null for expired tokens without trying alternate secrets', () => {
    vi.stubEnv('JWT_SECRET', 'a')
    vi.stubEnv('PAYLOAD_SECRET', 'b')
    const token = jwt.sign({ id: 1 }, 'a', { expiresIn: '-1s' })
    expect(tryVerifyJwtWithAppSecrets(token)).toBeNull()
  })
})
