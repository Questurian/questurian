import { describe, expect, it, vi } from 'vitest'
import { generateAltText } from './alt-text.api'
import { generateAltTextApi } from './generate-alt-text.api'

vi.mock('./generate-alt-text.api', () => ({
  generateAltTextApi: vi.fn()
}))

describe('alt text public API', () => {
  it('forwards the image and narrative focus and returns generated text', async () => {
    const file = new File(['image'], 'image.webp', { type: 'image/webp' })
    vi.mocked(generateAltTextApi).mockResolvedValue('Accessible description')

    await expect(generateAltText(file, 'Focus on access')).resolves.toBe(
      'Accessible description'
    )
    expect(generateAltTextApi).toHaveBeenCalledWith({
      file,
      narrativeFocus: 'Focus on access'
    })
  })

  it('preserves request failures', async () => {
    const error = new Error('Alt text generation timed out')
    vi.mocked(generateAltTextApi).mockRejectedValue(error)

    await expect(
      generateAltText(new File(['image'], 'image.webp'))
    ).rejects.toBe(error)
  })
})
