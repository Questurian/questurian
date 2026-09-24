import type { Payload } from 'payload'

import { APP_CONFIG } from '@/shared/config'
import type { EmailResult } from '../types'
import { recordEmailLog } from './email-log'
import { maskEmail } from './mask-email'

export { maskEmail }

/**
 * Escapes a value for HTML text or a double-quoted attribute.
 *
 * Every value a visitor controls goes through this before it reaches a
 * template. A display name is typed at sign-up, and sign-up mails a
 * verification link to whatever address was typed. Unescaped, anyone could
 * register a stranger's address with a "name" that is a link or a fake
 * notice, and Questurian would deliver it for them, from our own domain.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Builds a personalized greeting from first/last name, escaped for HTML.
 */
export function buildGreeting(firstName?: string, lastName?: string): string {
  const name = firstName || lastName ? `${firstName || ''} ${lastName || ''}`.trim() : ''
  return name ? `Hello ${escapeHtml(name)}` : 'Hello'
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
}

/**
 * The plain-text part, derived from the HTML so the two cannot drift.
 *
 * Mail with no text part scores worse with spam filters and is unreadable in
 * text-only clients. Links keep their address ("Reset password:
 * https://..."), because a text part whose button went missing is useless.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) => {
      const text = label.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      return text && text !== href ? `${text}: ${href}` : href
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|h[1-6]|ul|ol|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity] ?? entity)
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Generic email sending utility with consistent error handling and logging
 */
export async function sendEmail(
  payload: Payload,
  config: {
    emailType: string
    to: string
    subject: string
    html: string
  }
): Promise<EmailResult> {
  try {
    console.log(`📧 Sending ${config.emailType} to:`, maskEmail(config.to))

    // The From header is the adapter's default (payload.config.ts), set from
    // EMAIL_FROM_ADDRESS / EMAIL_FROM_NAME. Reply-To only when configured.
    const replyTo = APP_CONFIG.email.replyTo
    await payload.sendEmail({
      to: config.to,
      subject: config.subject,
      html: config.html,
      text: htmlToText(config.html),
      ...(replyTo ? { replyTo } : {}),
    })

    console.log(`✅ ${config.emailType} sent successfully to:`, maskEmail(config.to))
    await recordEmailLog(payload, {
      emailType: config.emailType,
      recipient: config.to,
      subject: config.subject,
      status: 'sent',
    })
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`❌ Failed to send ${config.emailType}:`, {
      email: maskEmail(config.to),
      error: message
    })
    await recordEmailLog(payload, {
      emailType: config.emailType,
      recipient: config.to,
      subject: config.subject,
      status: 'failed',
      error: message,
    })
    return {
      success: false,
      error: message
    }
  }
}

/**
 * Base styles for email paragraphs
 */
export const EMAIL_PARAGRAPH_STYLE = 'font-size: 16px; line-height: 1.5; color: #666;'

/**
 * Creates a styled info box for emails
 */
export function createInfoBox(
  type: 'success' | 'info' | 'warning' | 'primary',
  content: string
): string {
  const colors = {
    success: { bg: '#e8f5e8', border: '#28a745', text: '#155724' },
    info: { bg: '#e7f3ff', border: '#0066cc', text: '#0066cc' },
    warning: { bg: '#fff3cd', border: '#ffc107', text: '#856404' },
    primary: { bg: '#e8f0fe', border: '#4285f4', text: '#1565c0' }
  }

  const color = colors[type]

  return `
    <div style="background-color: ${color.bg}; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid ${color.border};">
      <p style="font-size: 14px; line-height: 1.5; color: ${color.text}; margin: 0;">
        ${content}
      </p>
    </div>
  `
}

/**
 * Creates a standard footer signature
 */
export function createFooter(teamName: string = 'Questurian Team'): string {
  return `
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      Best regards,<br>
      The ${teamName}
    </p>
  `
}

/**
 * Wraps email content in a consistent HTML email template
 */
export function wrapEmailContent(content: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background-color: #ffffff;
            border-radius: 8px;
            padding: 40px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          }
        </style>
      </head>
      <body>
        <div class="container">
          ${content}
        </div>
      </body>
    </html>
  `
}

/**
 * Creates a styled section box for organizing email content
 */
export function createSectionBox(
  title: string,
  content: string,
  type: 'neutral' | 'success' | 'info' | 'warning' | 'primary' = 'neutral'
): string {
  const colors = {
    neutral: { bg: '#f8f9fa', border: '#dee2e6', text: '#666' },
    success: { bg: '#e8f5e8', border: '#28a745', text: '#155724' },
    info: { bg: '#e7f3ff', border: '#0066cc', text: '#0066cc' },
    warning: { bg: '#fff3cd', border: '#ffc107', text: '#856404' },
    primary: { bg: '#e8f0fe', border: '#4285f4', text: '#1565c0' }
  }

  const color = colors[type]

  return `
    <div style="background-color: ${color.bg}; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid ${color.border};">
      <p style="font-size: 16px; font-weight: bold; color: ${color.text}; margin-top: 0; margin-bottom: 15px;">
        ${title}
      </p>
      <div style="color: ${color.text}; font-size: 14px; line-height: 1.6;">
        ${content}
      </div>
    </div>
  `
}

/**
 * A button plus the bare link beneath it, for clients that drop the button.
 * `url` is escaped for the attribute. It must already be an absolute https
 * address on the site or API host; the render tests hold every template to
 * that.
 */
export function createActionLink(url: string, label: string): string {
  const href = escapeHtml(url)
  return `
    <div style="text-align: center; margin: 30px 0;">
      <a href="${href}" style="background-color: #1A1A1A; color: #ffffff; padding: 14px 22px; border-radius: 4px; text-decoration: none; font-weight: 600; display: inline-block;">
        ${escapeHtml(label)}
      </a>
    </div>
    <p style="font-size: 14px; line-height: 1.5; color: #777;">
      If the button does not work, copy and paste this link into your browser:
      <br>
      <a href="${href}" style="color: #1A1A1A; word-break: break-all;">${href}</a>
    </p>
  `
}

