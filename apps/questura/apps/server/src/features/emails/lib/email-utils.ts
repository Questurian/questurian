import type { Payload } from 'payload'

/**
 * Base interface for all email data
 */
export interface BaseEmailData {
  email: string
  firstName?: string
  lastName?: string
}

/**
 * Result returned from email sending functions
 */
export interface EmailResult {
  success: boolean
  error?: string
}

/**
 * Builds a personalized greeting from first/last name
 */
export function buildGreeting(firstName?: string, lastName?: string): string {
  const name = firstName || lastName ? `${firstName || ''} ${lastName || ''}`.trim() : ''
  return name ? `Hello ${name}` : 'Hello'
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
    console.log(`📧 Sending ${config.emailType} to:`, config.to)

    await payload.sendEmail({
      to: config.to,
      subject: config.subject,
      html: config.html,
    })

    console.log(`✅ ${config.emailType} sent successfully to:`, config.to)
    return { success: true }
  } catch (error) {
    console.error(`❌ Failed to send ${config.emailType}:`, {
      email: config.to,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
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

