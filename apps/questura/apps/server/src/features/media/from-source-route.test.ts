import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  assemble: vi.fn(),
}))

vi.mock('payload', () => ({
  getPayload: vi.fn().mockResolvedValue({ auth: mocks.auth }),
}))

vi.mock('@/payload.config', () => ({ default: {} }))

vi.mock('@/features/media/pipeline/assemble-media-set', () => ({
  assembleMediaSetFromSource: mocks.assemble,
}))

import { POST } from '@/app/api/media-sets/from-source/route'
import { LOCATION_MANAGER_SERVICE_ACCOUNT } from '@/features/auth/lib/service-account-grants'

describe('POST /api/media-sets/from-source', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lets Location Manager reach request validation', async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: 1,
        collection: 'service-accounts',
        name: LOCATION_MANAGER_SERVICE_ACCOUNT,
      },
    })
    const response = await POST(
      new NextRequest('http://localhost:4000/api/media-sets/from-source', {
        method: 'POST',
        headers: { 'content-type': 'multipart/form-data; boundary=probe' },
        body: [
          '--probe',
          'Content-Disposition: form-data; name="probe"',
          '',
          'authenticated',
          '--probe--',
          '',
        ].join('\r\n'),
      }),
    )

    await expect({
      status: response.status,
      body: await response.json(),
    }).toEqual({
      status: 400,
      body: { message: 'source file is required (multipart field "source")' },
    })
    expect(mocks.assemble).not.toHaveBeenCalled()
  })
})
