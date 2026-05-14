import type { NextRequest } from 'next/server'

/** Extracts a safe error message from an unknown thrown value, falling back when empty. */
export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

/** True when the caller requests a lean response payload via `?response=lean`. */
export function wantsLeanResponse(req: NextRequest): boolean {
  return new URL(req.url).searchParams.get('response') === 'lean'
}
