/**
 * One client address, written the one way every limiter counts it.
 *
 * A rate-limit bucket is keyed on this string, so anything that lets one
 * caller produce many strings is a bypass:
 *
 *  - **IPv6 is counted per /64.** A home connection, a phone or a VPS is
 *    handed a whole /64 and picks any address in it at will. Counting each
 *    address gave that caller 2^64 fresh buckets, through Cloudflare, with no
 *    header forged. Better Auth buckets by /64 by default; this matches it.
 *  - **Spelling is fixed.** `2001:db8::1` and `2001:0DB8:0:0::1` are one
 *    address, and an IPv4 caller on a dual-stack socket (`::ffff:192.0.2.1`)
 *    is the IPv4 caller.
 *  - **A value that is not an address is refused** (`null`). A proxy that
 *    overwrites its header never writes one. A caller who reaches the origin
 *    directly can write anything, and every distinct string used to be its
 *    own bucket. The caller of this decides what "not an address" shares.
 *
 * Pure string handling, no `node:net`, so it runs wherever a limiter does.
 * `client-address.test.ts` checks it agrees with `node:net` on validity.
 */

const IPV4 = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/
const HEX_GROUP = /^[0-9a-f]{1,4}$/

/** The eight 16-bit groups of an IPv6 address, or `null`. */
function parseIPv6(value: string): number[] | null {
  const halves = value.split('::')
  if (halves.length > 2) return null

  const toGroups = (part: string): number[] | null => {
    if (part === '') return []
    const pieces = part.split(':')
    const groups: number[] = []

    for (const [index, piece] of pieces.entries()) {
      // An embedded IPv4 tail (`::ffff:192.0.2.1`) is two groups, and only
      // ever the last piece.
      if (index === pieces.length - 1 && piece.includes('.')) {
        if (!IPV4.test(piece)) return null
        const [a, b, c, d] = piece.split('.').map(Number) as [number, number, number, number]
        groups.push((a << 8) | b, (c << 8) | d)
        continue
      }
      if (!HEX_GROUP.test(piece)) return null
      groups.push(Number.parseInt(piece, 16))
    }

    return groups
  }

  const head = toGroups(halves[0]!)
  if (!head) return null

  if (halves.length === 1) return head.length === 8 ? head : null

  // An IPv4 tail may only end the address, so it cannot sit before `::`.
  if (halves[0]!.includes('.')) return null

  const tail = toGroups(halves[1]!)
  if (!tail) return null

  // `::` stands for at least one zero group.
  const missing = 8 - head.length - tail.length
  if (missing < 1) return null

  return [...head, ...Array<number>(missing).fill(0), ...tail]
}

export function normalizeClientAddress(raw: string): string | null {
  const value = raw.trim().toLowerCase()
  // Cheap early exit; the parsers below reject these too, so mutants here are
  // equivalent and not worth a test.
  // Stryker disable next-line all: redundant length guard, see above
  if (value.length === 0 || value.length > 45) return null

  if (IPV4.test(value)) return value

  const groups = parseIPv6(value)
  if (!groups) return null

  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups as [
    number, number, number, number, number, number, number, number,
  ]

  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    return [g6 >> 8, g6 & 0xff, g7 >> 8, g7 & 0xff].join('.')
  }

  return `${[g0, g1, g2, g3].map((group) => group.toString(16)).join(':')}::`
}
