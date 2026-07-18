import type { Payload } from 'payload'

import { APP_CONFIG } from '../../../shared/config'

export type EmailLogEntry = {
  emailType: string
  recipient: string
  subject?: string
  status: 'sent' | 'failed'
  error?: string
}

/** Single switch for the whole tracking system: EMAIL_TRACKING=false turns it off. */
export function isEmailTrackingEnabled(): boolean {
  return APP_CONFIG.features.emailTracking
}

/**
 * Append a row to the email-logs collection. Logging must never break a send
 * path, so failures are swallowed after a console warning.
 */
export async function recordEmailLog(payload: Payload, entry: EmailLogEntry): Promise<void> {
  if (!isEmailTrackingEnabled()) return

  try {
    await payload.create({
      collection: 'email-logs',
      data: {
        emailType: entry.emailType,
        recipient: entry.recipient.toLowerCase(),
        subject: entry.subject,
        status: entry.status,
        error: entry.error,
      },
    })
  } catch (error) {
    console.error('⚠️ Failed to record email log entry:', {
      emailType: entry.emailType,
      recipient: entry.recipient,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
