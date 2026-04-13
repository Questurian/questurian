import jwt from 'jsonwebtoken'
import type { JwtPayload } from '../types/jwt'

function uniqueNonEmptyStrings(values: (string | undefined)[]): string[] {
  const out: string[] = []
  for (const v of values) {
    if (v && !out.includes(v)) {
      out.push(v)
    }
  }
  return out
}

/**
 * Verifies HS256 JWTs using every distinct signing secret the app may use.
 * Custom routes sign with JWT_SECRET; Payload session tokens use PAYLOAD_SECRET.
 * When both env vars differ, verifying with only one produces JsonWebTokenError: invalid signature.
 */
export function tryVerifyJwtWithAppSecrets(token: string): JwtPayload | null {
  const secrets = uniqueNonEmptyStrings([
    process.env.JWT_SECRET,
    process.env.PAYLOAD_SECRET,
  ])

  for (let i = 0; i < secrets.length; i++) {
    try {
      return jwt.verify(token, secrets[i]) as JwtPayload
    } catch (e: unknown) {
      if (e instanceof jwt.TokenExpiredError) {
        return null
      }
      if (
        e instanceof jwt.JsonWebTokenError &&
        e.message === 'invalid signature' &&
        i < secrets.length - 1
      ) {
        continue
      }
      return null
    }
  }

  return null
}
