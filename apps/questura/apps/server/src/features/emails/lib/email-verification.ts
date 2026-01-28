import type { Payload } from 'payload'

interface EmailVerificationParams {
  email: string
  firstName: string
  lastName: string
  code: string
}

export async function sendEmailVerificationEmail(
  payload: Payload,
  { email, firstName, lastName, code }: EmailVerificationParams
): Promise<void> {
  const displayName = firstName || lastName ? `${firstName} ${lastName}`.trim() : email

  await payload.sendEmail({
    to: email,
    subject: 'Verify your email address',
    html: `
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
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            h1 {
              color: #1a1a1a;
              font-size: 24px;
              margin-bottom: 10px;
            }
            .code-container {
              background-color: #f5f5f5;
              border-radius: 8px;
              padding: 30px;
              text-align: center;
              margin: 30px 0;
            }
            .code {
              font-size: 36px;
              font-weight: bold;
              letter-spacing: 8px;
              color: #2563eb;
              font-family: 'Courier New', monospace;
            }
            .message {
              color: #666;
              font-size: 14px;
              margin-top: 15px;
            }
            .footer {
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px solid #e5e5e5;
              text-align: center;
              color: #999;
              font-size: 12px;
            }
            .warning {
              background-color: #fef3c7;
              border-left: 4px solid #f59e0b;
              padding: 15px;
              margin: 20px 0;
              border-radius: 4px;
            }
            .warning p {
              margin: 0;
              color: #92400e;
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Verify Your Email Address</h1>
              <p>Hi ${displayName},</p>
            </div>

            <p>Thank you for signing up! Please use the verification code below to complete your registration.</p>

            <div class="code-container">
              <div class="code">${code}</div>
              <p class="message">Enter this code to verify your email address</p>
            </div>

            <div class="warning">
              <p><strong>Important:</strong> This code will expire in 15 minutes.</p>
            </div>

            <p>If you didn't create an account, you can safely ignore this email.</p>

            <div class="footer">
              <p>This is an automated email. Please do not reply to this message.</p>
            </div>
          </div>
        </body>
      </html>
    `,
  })
}
