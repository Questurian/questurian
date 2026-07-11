import { describe, expect, it } from 'vitest'

import { resolveFetchableSourceUrl } from './regenerate-variants'

const restoreEnv = (key: string, value: string | undefined) => {
  if (value === undefined) {
    delete process.env[key]
    return
  }
  process.env[key] = value
}

describe('resolveFetchableSourceUrl', () => {
  it('keeps absolute source URLs unchanged', () => {
    expect(resolveFetchableSourceUrl('https://cdn.example/image.webp')).toBe(
      'https://cdn.example/image.webp',
    )
  })

  it('resolves Payload relative media URLs against the backend URL', () => {
    const previousHostname = process.env.BUNNY_STORAGE_HOSTNAME
    delete process.env.BUNNY_STORAGE_HOSTNAME

    expect(resolveFetchableSourceUrl('/api/media-assets/file/source.webp')).toBe(
      'http://localhost:4000/api/media-assets/file/source.webp',
    )

    restoreEnv('BUNNY_STORAGE_HOSTNAME', previousHostname)
  })

  it('resolves Payload media file URLs to Bunny CDN when configured', () => {
    const previousHostname = process.env.BUNNY_STORAGE_HOSTNAME
    process.env.BUNNY_STORAGE_HOSTNAME = 'questurian-cdn.b-cdn.net'

    expect(resolveFetchableSourceUrl('/api/media-assets/file/source_0-86.webp')).toBe(
      'https://questurian-cdn.b-cdn.net/media/source_0-86.webp',
    )

    restoreEnv('BUNNY_STORAGE_HOSTNAME', previousHostname)
  })
})
