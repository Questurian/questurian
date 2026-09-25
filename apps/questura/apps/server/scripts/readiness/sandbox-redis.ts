/**
 * Emptying the sandbox Redis, which two harnesses need and neither should own.
 *
 * Rate-limit windows are sixty seconds wide and the counters are shared across
 * every process pointed at the same Redis. A harness that makes forty requests
 * in a burst is not a reader, and without a flush between phases the budget
 * spent by one check is still spent during the next — so the second check
 * measures the first one instead of the thing it names. The L14 baseline found
 * this the hard way: ten of twelve sitemap samples came back `429`, and the
 * step was reported as a failure of the server rather than of the harness.
 *
 * This is not a way around the limiter. The limiter's own behaviour is proved
 * in `serving-fleet.ts`, deliberately, by spending the budget and watching the
 * refusals arrive; this is for the runs whose subject is something else.
 *
 * Raw RESP over a socket rather than shelling out to `redis-cli`, so the
 * harness does not depend on a binary being installed. Two refusals guard it:
 * the host must be loopback, and the port must not be Redis's default — the
 * sandbox runs on 6390 for exactly that reason.
 */

import { connect } from 'node:net'

export async function flushSandboxRedis(redisUrl: string): Promise<void> {
  await sendToSandboxRedis(redisUrl, ['FLUSHDB'])
}

/**
 * Delete only the keys matching `pattern`, for a harness that must keep the
 * rest: visitor sessions live in this Redis too (Better Auth secondary
 * storage), so a mid-run FLUSHDB signs every harness identity out.
 */
export async function clearSandboxRedisKeys(redisUrl: string, pattern: string): Promise<void> {
  const script = "for _, key in ipairs(redis.call('KEYS', ARGV[1])) do redis.call('DEL', key) end return 1"
  await sendToSandboxRedis(redisUrl, ['EVAL', script, '0', pattern])
}

function resp(args: string[]): string {
  return `*${args.length}\r\n${args.map((arg) => `$${Buffer.byteLength(arg)}\r\n${arg}\r\n`).join('')}`
}

async function sendToSandboxRedis(redisUrl: string, command: string[]): Promise<void> {
  const url = new URL(redisUrl)

  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    throw new Error(`Refusing to flush a non-loopback Redis (${url.hostname}).`)
  }
  if (!url.port || url.port === '6379') {
    throw new Error(`Refusing to flush Redis on port ${url.port || '(default)'} — the sandbox uses its own port.`)
  }

  await new Promise<void>((done, fail) => {
    const socket = connect({ host: url.hostname, port: Number(url.port) }, () => {
      socket.write(resp(command))
    })
    socket.on('data', () => {
      socket.end()
      done()
    })
    socket.on('error', fail)
    socket.setTimeout(3_000, () => {
      socket.destroy()
      fail(new Error('Timed out flushing the sandbox Redis.'))
    })
  })
}
