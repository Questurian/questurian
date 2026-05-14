import type { getPayload } from 'payload'

export type LoggerLike = {
  info: (message: string, data?: Record<string, unknown>) => void
  warn: (message: string, data?: Record<string, unknown>) => void
}

export type PayloadInstance = Awaited<ReturnType<typeof getPayload>>

export type RouteContext<Params extends Record<string, string> = Record<string, string>> = {
  params: Promise<Params>
}
