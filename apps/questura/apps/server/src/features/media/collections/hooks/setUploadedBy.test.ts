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

  it('strips forged staff attribution from a machine create', async () => {
    const data = {
      alt: 'Lima skyline',
      user: 11,
      uploadedBy: '11',
    }

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

  it('strips forged staff attribution from a machine update', async () => {
    const result = await setUploadedBy({
      operation: 'update',
      data: {
        alt: 'Updated Lima skyline',
        user: 11,
        uploadedBy: '11',
      },
      originalDoc: {
        alt: 'Lima skyline',
        user: 23,
        uploadedBy: '23',
      },
      req: {
        user: {
          id: 7,
          collection: 'service-accounts',
          name: 'Location Manager',
        },
      },
    } as never)

    expect(result).toEqual({
      alt: 'Updated Lima skyline',
      user: 23,
      uploadedBy: '23',
    })
  })
})
