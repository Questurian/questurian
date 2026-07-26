import { describe, expect, it, vi } from 'vitest'
import { processImageOnly } from './image-processing.api'
import { processImageOnlyApi } from './process-image-only.api'

vi.mock('./process-image-only.api', () => ({
  processImageOnlyApi: vi.fn()
}))

describe('image processing public API', () => {
  it('keeps the empty alt text default and returns processing output', async () => {
    const file = new File(['image'], 'image.webp')
    const response = {
      success: true,
      original_filename: 'image.webp',
      original_size: 5,
      variants: {}
    }
    vi.mocked(processImageOnlyApi).mockResolvedValue(response)

    await expect(processImageOnly(file)).resolves.toBe(response)
    expect(processImageOnlyApi).toHaveBeenCalledWith({ file, altText: '' })
  })
})
