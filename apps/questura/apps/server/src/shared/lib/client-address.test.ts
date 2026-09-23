import { isIP } from 'node:net'

import { describe, expect, it } from 'vitest'

import { normalizeClientAddress } from './client-address'

describe('normalizeClientAddress', () => {
  it('keeps an IPv4 address as it is', () => {
    expect(normalizeClientAddress('192.0.2.1')).toBe('192.0.2.1')
    expect(normalizeClientAddress(' 192.0.2.1 ')).toBe('192.0.2.1')
  })

  // One household, one phone or one VPS gets a whole /64. Counting each
  // address separately hands that caller 2^64 fresh buckets.
  it('buckets IPv6 by /64', () => {
    const a = normalizeClientAddress('2001:db8:1:2:aaaa:bbbb:cccc:dddd')
    const b = normalizeClientAddress('2001:db8:1:2::1')
    const c = normalizeClientAddress('2001:DB8:1:2:ffff:ffff:ffff:ffff')

    expect(a).toBe('2001:db8:1:2::')
    expect(b).toBe(a)
    expect(c).toBe(a)
  })

  it('keeps neighbouring /64s apart', () => {
    expect(normalizeClientAddress('2001:db8:1:2::1')).not.toBe(
      normalizeClientAddress('2001:db8:1:3::1')
    )
  })

  it('writes every spelling of one IPv6 /64 the same way', () => {
    const spellings = [
      '2001:0db8:0000:0000:0000:0000:0000:0001',
      '2001:db8::1',
      '2001:db8:0:0::1',
      '2001:DB8::0:1',
    ]

    expect(new Set(spellings.map(normalizeClientAddress))).toEqual(new Set(['2001:db8:0:0::']))
  })

  // An IPv4 caller seen through a dual-stack socket must share its IPv4 bucket.
  it('unwraps an IPv4-mapped IPv6 address', () => {
    expect(normalizeClientAddress('::ffff:192.0.2.1')).toBe('192.0.2.1')
    expect(normalizeClientAddress('::FFFF:c000:0201')).toBe('192.0.2.1')
    expect(normalizeClientAddress('0:0:0:0:0:ffff:192.0.2.1')).toBe('192.0.2.1')
  })

  // A proxy that overwrites its header never writes these. A caller reaching
  // the origin directly can, and each distinct string used to be its own
  // bucket.
  it.each([
    '',
    '   ',
    'unknown',
    'not-an-ip',
    '192.0.2.1, 198.51.100.1',
    '192.0.2.256',
    '192.0.2',
    '192.0.2.1.5',
    '01.2.3.4',
    '1.2.3.4 ',
    '1.2.3.4\n',
    '1.2.3.4:443',
    '[2001:db8::1]',
    '2001:db8::1%eth0',
    '2001:db8:::1',
    '2001:db8::1::2',
    '1:2:3:4:5:6:7:8:9',
    '1:2:3:4:5:6:7',
    '12345::1',
    'g::1',
    '::ffff:999.0.0.1',
    '1.2.3.4\u0000',
    '١٩٢.٠.٢.١',
    'x'.repeat(10_000),
  ])('refuses %j', (value) => {
    // Trailing whitespace is trimmed before parsing, so a padded valid
    // address is accepted; everything else in this table is not an address.
    if (value.trim() !== value && isIP(value.trim())) {
      expect(normalizeClientAddress(value)).not.toBeNull()
      return
    }
    expect(normalizeClientAddress(value)).toBeNull()
  })

  // Agrees with Node's parser on validity for every string it is shown, so
  // the hand-written parser has no private idea of what an address is. Seeded,
  // so a failure reproduces.
  it('agrees with node:net on which strings are addresses', () => {
    let seed = 0x5eed
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31
      return seed / 2 ** 31
    }
    const alphabet = '0123456789abcdefABCDEF:.:::.%[] ,x'
    const pick = <T,>(items: readonly T[]) => items[Math.floor(random() * items.length)]!

    const generated: string[] = []
    for (let i = 0; i < 20_000; i += 1) {
      const length = 1 + Math.floor(random() * 40)
      let value = ''
      for (let j = 0; j < length; j += 1) value += pick(alphabet.split(''))
      generated.push(value)
    }
    for (let i = 0; i < 5_000; i += 1) {
      const groups = Array.from({ length: 8 }, () =>
        Math.floor(random() * 0x10000).toString(16)
      )
      const cut = Math.floor(random() * 8)
      const span = Math.floor(random() * (8 - cut))
      generated.push(groups.join(':'))
      generated.push(
        `${groups.slice(0, cut).join(':')}::${groups.slice(cut + span + 1).join(':')}`
      )
      generated.push(
        Array.from({ length: 4 }, () => Math.floor(random() * 300)).join('.')
      )
    }

    for (const value of generated) {
      if (value.includes('%')) continue // Node accepts zone ids; a client address has none.
      expect(normalizeClientAddress(value) !== null, value).toBe(isIP(value) !== 0)
    }
  })

  it('always returns something Node itself reads as an address', () => {
    for (const value of ['192.0.2.1', '2001:db8::1', '::1', '::', '::ffff:192.0.2.1', 'fe80::1']) {
      expect(isIP(normalizeClientAddress(value)!), value).not.toBe(0)
    }
  })
})
