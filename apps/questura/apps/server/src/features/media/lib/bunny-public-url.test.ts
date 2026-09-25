import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { MEDIA_ASSETS_PREFIX, buildPublicMediaUrl, bunnyPublicHost, sandboxMediaOrigin, sandboxMediaUrl } from './bunny-public-url'

const HOSTNAME = 'questurian-cdn.b-cdn.net'

describe('buildPublicMediaUrl', () => {
  let previousHostname: string | undefined

  beforeEach(() => {
    previousHostname = process.env.BUNNY_STORAGE_HOSTNAME
    process.env.BUNNY_STORAGE_HOSTNAME = HOSTNAME
  })

  afterEach(() => {
    if (previousHostname === undefined) delete process.env.BUNNY_STORAGE_HOSTNAME
    else process.env.BUNNY_STORAGE_HOSTNAME = previousHostname
  })

  /**
   * The contract that matters: this has to produce the same string the storage
   * adapter writes into `url`, or a file would have two addresses. The adapter
   * builds `https://${hostname}/${encodeURI(posix.join(prefix, filename))}`.
   */
  it('matches the shape the storage adapter writes into url', () => {
    expect(buildPublicMediaUrl('johanna-peru-surco-4_square.webp')).toBe(
      `https://${HOSTNAME}/media/johanna-peru-surco-4_square.webp`,
    )
  })

  it('uses the stored prefix over the default when one is given', () => {
    expect(buildPublicMediaUrl('x_wide.webp', 'other')).toBe(`https://${HOSTNAME}/other/x_wide.webp`)
    expect(MEDIA_ASSETS_PREFIX).toBe('media')
  })

  it('omits the prefix entirely when the row has none', () => {
    expect(buildPublicMediaUrl('x_wide.webp', null)).toBe(`https://${HOSTNAME}/x_wide.webp`)
  })

  /*
   * Only 4 of 101,243 files in the zone carry a character outside
   * [A-Za-z0-9._-], and all four are spaces. `encodeURI` leaves `#`, `?` and
   * `&` alone where `encodeURIComponent` would not -- no filename contains
   * those, which is why the two agree on real data.
   */
  it('percent-encodes a space, the only special character in the zone', () => {
    expect(buildPublicMediaUrl('food-1 2.jpg')).toBe(`https://${HOSTNAME}/media/food-1%202.jpg`)
  })

  it('tolerates a hostname written with a scheme or a trailing slash', () => {
    process.env.BUNNY_STORAGE_HOSTNAME = `https://${HOSTNAME}/`
    expect(buildPublicMediaUrl('x_hero.webp')).toBe(`https://${HOSTNAME}/media/x_hero.webp`)
  })

  it('returns null rather than a nowhere URL when storage is unconfigured', () => {
    delete process.env.BUNNY_STORAGE_HOSTNAME

    expect(bunnyPublicHost()).toBeNull()
    expect(buildPublicMediaUrl('x_hero.webp')).toBeNull()
  })

  it('returns null for an empty filename', () => {
    expect(buildPublicMediaUrl('')).toBeNull()
    expect(buildPublicMediaUrl(null)).toBeNull()
    expect(buildPublicMediaUrl(undefined)).toBeNull()
  })
})

describe('the readiness sandbox media origin (launch fix plan item 8)', () => {
  const SANDBOX = { READINESS_SANDBOX: '1', READINESS_MEDIA_ORIGIN: 'http://media.readiness.localhost:3190' }

  it('is off unless the sandbox says so by name', () => {
    expect(sandboxMediaOrigin({})).toBeNull()
    expect(sandboxMediaOrigin({ READINESS_MEDIA_ORIGIN: SANDBOX.READINESS_MEDIA_ORIGIN })).toBeNull()
    expect(sandboxMediaOrigin({ READINESS_SANDBOX: '1' })).toBeNull()
  })

  it('accepts plain http on this machine only', () => {
    expect(sandboxMediaOrigin(SANDBOX)).toBe('http://media.readiness.localhost:3190')
    expect(sandboxMediaOrigin({ ...SANDBOX, READINESS_MEDIA_ORIGIN: 'http://127.0.0.1:3190/' })).toBe('http://127.0.0.1:3190')
    for (const bad of ['https://media.readiness.localhost:3190', 'http://questurian-cdn.b-cdn.net:80', 'http://10.0.0.1:3190', 'http://media.readiness.localhost', 'http://127.0.0.1:3190/media']) {
      expect(() => sandboxMediaOrigin({ ...SANDBOX, READINESS_MEDIA_ORIGIN: bad })).toThrow(/READINESS_MEDIA_ORIGIN/)
    }
  })

  it('moves both the adapter address and the built address to the media server, keeping the path', () => {
    const previous = { ...process.env }
    process.env.BUNNY_STORAGE_HOSTNAME = 'readiness-media.invalid'
    Object.assign(process.env, SANDBOX)
    try {
      expect(buildPublicMediaUrl('launch-01.jpg')).toBe('http://media.readiness.localhost:3190/media/launch-01.jpg')
      expect(sandboxMediaUrl('https://readiness-media.invalid/media/launch-01_w640.jpg')).toBe(
        'http://media.readiness.localhost:3190/media/launch-01_w640.jpg',
      )
    } finally {
      process.env = previous
    }
  })

  it('leaves real addresses alone outside the sandbox', () => {
    const url = 'https://questurian-cdn.b-cdn.net/media/a.webp'
    const previous = process.env.READINESS_SANDBOX
    delete process.env.READINESS_SANDBOX
    try {
      expect(sandboxMediaUrl(url)).toBe(url)
    } finally {
      if (previous !== undefined) process.env.READINESS_SANDBOX = previous
    }
  })
})
