import type { Payload } from 'payload'
import { APP_URLS } from '@/shared/config'

import type { GoogleAccountLinkedParams } from '../types'

export async function sendGoogleAccountLinkedEmail(
  payload: Payload,
  { email, firstName, lastName, googleEmail }: GoogleAccountLinkedParams
): Promise<void> {
  const displayName = firstName || lastName ? `${firstName} ${lastName}`.trim() : 'there'
  const accountUrl = APP_URLS.frontendUrl('/account')

  await payload.sendEmail({
    to: email,
    subject: 'Google account linked successfully',
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
              background-color: #f9fafb;
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
            .icon {
              font-size: 48px;
              margin-bottom: 20px;
            }
            .info-box {
              background-color: #f0f9ff;
              border-left: 4px solid #2563eb;
              padding: 20px;
              margin: 25px 0;
              border-radius: 4px;
            }
            .info-box p {
              margin: 8px 0;
              color: #1e40af;
              font-size: 14px;
            }
            .info-box strong {
              color: #1e3a8a;
            }
            .benefits {
              margin: 30px 0;
              padding: 20px;
              background-color: #f9fafb;
              border-radius: 8px;
            }
            .benefit-item {
              margin: 12px 0;
              padding-left: 25px;
              position: relative;
              font-size: 14px;
            }
            .benefit-item:before {
              content: "✓";
              position: absolute;
              left: 0;
              color: #10b981;
              font-weight: bold;
              font-size: 18px;
            }
            .security-notice {
              background-color: #fef3c7;
              border-left: 4px solid #f59e0b;
              padding: 15px;
              margin: 25px 0;
              border-radius: 4px;
            }
            .security-notice p {
              margin: 0;
              color: #92400e;
              font-size: 14px;
            }
            .footer {
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px solid #e5e5e5;
              text-align: center;
              color: #999;
              font-size: 12px;
            }
            .cta-button {
              display: inline-block;
              background-color: #2563eb;
              color: #ffffff;
              text-decoration: none;
              padding: 12px 28px;
              border-radius: 6px;
              font-weight: 600;
              margin: 20px 0;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="icon">🔗</div>
              <h1>Google Account Linked</h1>
              <p>Hi ${displayName},</p>
            </div>

            <p>
              Your Google account has been successfully linked to your existing account. You now have dual authentication enabled!
            </p>

            <div class="info-box">
              <p><strong>Account Email:</strong> ${email}</p>
              <p><strong>Linked Google Account:</strong> ${googleEmail}</p>
              <p><strong>Authentication Mode:</strong> Dual (Password + Google)</p>
            </div>

            <div class="benefits">
              <h3 style="margin-top: 0; color: #1a1a1a;">Benefits of dual authentication:</h3>
              <div class="benefit-item">Sign in with either your password or Google account</div>
              <div class="benefit-item">One-click Google sign-in for faster access</div>
              <div class="benefit-item">Backup authentication method for account recovery</div>
              <div class="benefit-item">Enhanced security with multiple verification options</div>
            </div>

            <div style="text-align: center;">
              <a href="${accountUrl}" class="cta-button">
                Manage Your Account
              </a>
            </div>

            <div class="security-notice">
              <p><strong>Security Notice:</strong> If you didn't link this Google account, please secure your account immediately by changing your password and contacting support.</p>
            </div>

            <p style="color: #666; font-size: 14px; margin-top: 25px;">
              You can now use either authentication method to access your account. Both methods provide the same level of access and security.
            </p>

            <div class="footer">
              <p>This is an automated security notification.</p>
              <p>&copy; ${new Date().getFullYear()} All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `,
  })
}
