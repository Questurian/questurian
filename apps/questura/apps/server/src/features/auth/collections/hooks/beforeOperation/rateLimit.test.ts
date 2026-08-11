import { beforeEach, describe, expect, it } from 'vitest'

import { staffAuthRateLimitHook } from './rateLimit'
import { STAFF_LOGIN_LIMITS } from '@/features/auth/lib/staff-auth-rate-limit'
import { resetLocalCounters } from '@/shared/lib/rate-limit-counter'

function run(operation: string, email: string | null, ip = '192.0.2.100') {
  const args = { data: email === null ? {} : { email } }
  return (
    staffAuthRateLimitHook as unknown as (input: {
      args: unknown
      operation: string
      req: { headers: Headers }
    }) => Promise<unknown>
  )({
    args,
    operation,
    req: { headers: new Headers({ 'x-forwarded-for': ip }) },
  })
}

describe('staff auth rate limit hook', () => {
  beforeEach(() => {
    resetLocalCounters()
  })

  it('passes the args through under the limit', async () => {
    await expect(run('login', 'admin@questurian.com')).resolves.toEqual({
      data: { email: 'admin@questurian.com' },
    })
  })

  it('throws once the login limit is exceeded', async () => {
    for (let i = 0; i < STAFF_LOGIN_LIMITS.perEmail; i += 1) {
      await run('login', 'admin@questurian.com')
    }

    await expect(run('login', 'admin@questurian.com')).rejects.toThrow(/Too many attempts/)
  })

  it('does not reveal whether the account exists', async () => {
    for (let i = 0; i < STAFF_LOGIN_LIMITS.perEmail; i += 1) {
      await run('login', 'nobody@questurian.com')
    }

    await expect(run('login', 'nobody@questurian.com')).rejects.toThrow(
      /^Too many attempts\. Try again in \d+ seconds\.$/
    )
  })

  it('throttles forgotPassword as well as login', async () => {
    for (let i = 0; i < 3; i += 1) {
      await run('forgotPassword', 'victim@questurian.com', '192.0.2.101')
    }

    await expect(
      run('forgotPassword', 'victim@questurian.com', '192.0.2.101')
    ).rejects.toThrow(/Too many attempts/)
  })

  it.each(['create', 'update', 'read', 'delete', 'refresh'])(
    'ignores the %s operation entirely',
    async (operation) => {
      for (let i = 0; i < STAFF_LOGIN_LIMITS.perIp * 3; i += 1) {
        await expect(run(operation, 'admin@questurian.com')).resolves.toBeDefined()
      }
    }
  )

  it('normalizes email case so casing cannot be used to evade the limit', async () => {
    for (let i = 0; i < STAFF_LOGIN_LIMITS.perEmail; i += 1) {
      await run('login', 'Admin@Questurian.com', '192.0.2.102')
    }

    await expect(run('login', 'admin@questurian.com', '192.0.2.102')).rejects.toThrow(
      /Too many attempts/
    )
  })
})
