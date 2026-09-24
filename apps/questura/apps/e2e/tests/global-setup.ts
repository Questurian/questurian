import { connect } from 'node:net'

/**
 * Sandbox only: start each run with fresh rate-limit counters.
 *
 * The sign-in check allows 5 attempts a minute per address, by design. Two
 * runs a minute apart would otherwise fail on the limit, not on a bug. The
 * readiness sandbox's Redis is its own (127.0.0.1:6390, no persistence), so
 * emptying it is safe; sessions survive because they are also in Postgres.
 *
 * Never runs against a real site (`E2E_BASE_URL` set), and refuses any port
 * but the sandbox's: 6379 on this laptop is the live Redis.
 */
const SANDBOX_REDIS = { host: '127.0.0.1', port: 6390 }

export default async function globalSetup(): Promise<void> {
  if (process.env.E2E_BASE_URL) return
  if (SANDBOX_REDIS.port === 6379) throw new Error('Refusing to touch the live Redis.')

  await new Promise<void>((resolve, reject) => {
    const socket = connect(SANDBOX_REDIS, () => socket.write('*1\r\n$7\r\nFLUSHDB\r\n'))
    socket.once('data', (chunk) => {
      socket.end()
      chunk.toString().startsWith('+OK') ? resolve() : reject(new Error(`Sandbox Redis said ${chunk}`))
    })
    socket.once('error', (error) =>
      reject(new Error(`No sandbox Redis on 6390 (${error.message}). Start it: pnpm readiness:stack -- up`)),
    )
    socket.setTimeout(3_000, () => {
      socket.destroy()
      reject(new Error('Sandbox Redis did not answer.'))
    })
  })
}
