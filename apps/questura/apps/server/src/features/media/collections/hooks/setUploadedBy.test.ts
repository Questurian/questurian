import { describe, expect, it } from 'vitest'

import { setUploadedBy } from './setUploadedBy'

describe('setUploadedBy', () => {
  it('attributes a human upload to its staff user', async () => {
    const result = await setUploadedBy({
      operation: 'create',
      data: { alt: 'Lima skyline' },
      req: {
        user: {
          id: 11,
          collection: 'users',
          role: 'editor',
          status: 'active',
        },
      },
    } as never)

    expect(result).toEqual({
      alt: 'Lima skyline',
      uploadedBy: 11,
      user: 11,
    })
  })

  it('does not attribute a machine upload to a staff user', async () => {
    const data = { alt: 'Lima skyline' }

    const result = await setUploadedBy({
      operation: 'create',
      data,
      req: {
        user: {
          id: 7,
          collection: 'service-accounts',
          name: 'Location Manager',
        },
      },
    } as never)

    expect(result).toEqual({ alt: 'Lima skyline' })
  })
})
