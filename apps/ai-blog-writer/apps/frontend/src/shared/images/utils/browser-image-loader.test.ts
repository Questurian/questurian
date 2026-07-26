import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadImage } from './browser-image-loader'

class MockImage {
  crossOrigin: string | null = null
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  src = ''
}

describe('browser image loader', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('configures anonymous CORS before resolving the loaded image', async () => {
    const images: MockImage[] = []
    vi.stubGlobal(
      'Image',
      class extends MockImage {
        constructor() {
          super()
          images.push(this)
        }
      }
    )

    const result = loadImage('https://example.com/photo.jpg')
    expect(images[0]).toMatchObject({
      crossOrigin: 'anonymous',
      src: 'https://example.com/photo.jpg'
    })

    images[0].onload?.()
    await expect(result).resolves.toBe(images[0])
  })

  it('returns a stable error when the browser cannot load the source', async () => {
    const images: MockImage[] = []
    vi.stubGlobal(
      'Image',
      class extends MockImage {
        constructor() {
          super()
          images.push(this)
        }
      }
    )

    const result = loadImage('blob:broken')
    images[0].onerror?.()

    await expect(result).rejects.toThrow('Failed to load image')
  })
})
