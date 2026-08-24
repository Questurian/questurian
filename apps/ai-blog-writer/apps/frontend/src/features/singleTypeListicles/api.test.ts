import { afterEach, describe, expect, it, vi } from 'vitest'
import { updateListicle } from './api'

describe('single-type listicle Payload errors', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('surfaces nested validation detail instead of Payload generic message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          message: 'Something went wrong.',
          errors: [
            {
              message:
                'Item 3 selected Instagram embed is not in the source gallery.'
            }
          ]
        })
      })
    )

    await expect(updateListicle(11, {})).rejects.toThrow(
      'Item 3 selected Instagram embed is not in the source gallery.'
    )
  })
})
