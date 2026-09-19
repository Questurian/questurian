import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { MEDIA_ASSETS_PREFIX, buildPublicMediaUrl, bunnyPublicHost } from './bunny-public-url'

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
