import type { BunnyErrorInterface } from '../types'

export class BunnyError extends Error implements BunnyErrorInterface {
  statusCode?: number
  retryable?: boolean

  constructor(message: string, statusCode?: number, retryable?: boolean) {
    super(message)
    this.name = 'BunnyError'
    this.statusCode = statusCode
    this.retryable = retryable
  }
}
