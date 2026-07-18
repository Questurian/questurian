import type { CollectionAfterForgotPasswordHook } from 'payload'
import { recordEmailLog } from '@/features/emails/lib/email-log'

/**
 * Logs the password-set / reset-link email that Payload's forgot-password
 * operation dispatches. This is the email ABW's staff invite flow relies on
 * (ADR-0023: account created with a discarded password, hire sets their own).
 *
 * Payload only runs this hook after the email was handed to the provider —
 * unknown addresses return early and provider failures throw before the hook —
 * so a row here always means "accepted by Resend".
 */
export const logPasswordSetEmail: CollectionAfterForgotPasswordHook = async ({ args }) => {
  const email: unknown = args?.data?.email
  const payload = args?.req?.payload
  if (!payload || typeof email !== 'string' || email.length === 0) return

  await recordEmailLog(payload, {
    emailType: 'password-set-link',
    recipient: email,
    subject: 'Reset your password',
    status: 'sent',
  })
}
