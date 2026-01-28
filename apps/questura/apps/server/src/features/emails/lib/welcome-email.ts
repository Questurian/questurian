import type { Payload } from 'payload'
import { APP_URLS } from '@/shared/config'

interface WelcomeEmailParams {
  email: string
  firstName: string
  lastName: string
}

export async function sendWelcomeEmail(
  payload: Payload,
  { email, firstName, lastName }: WelcomeEmailParams
): Promise<void> {
  const displayName = firstName || lastName ? `${firstName} ${lastName}`.trim() : 'there'
  const frontendUrl = APP_URLS.frontendUrl('/login')

  await payload.sendEmail({
    to: email,
    subject: 'Welcome! Your account is verified',
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
              font-size: 28px;
              margin-bottom: 10px;
            }
            .emoji {
              font-size: 48px;
              margin-bottom: 20px;
            }
            .welcome-text {
              font-size: 16px;
              color: #666;
              margin: 20px 0;
            }
            .cta-button {
              display: inline-block;
              background-color: #2563eb;
              color: #ffffff;
              text-decoration: none;
              padding: 14px 32px;
              border-radius: 6px;
              font-weight: 600;
              margin: 30px 0;
              text-align: center;
            }
            .features {
              margin: 30px 0;
              padding: 20px;
              background-color: #f9fafb;
              border-radius: 8px;
            }
            .feature-item {
              margin: 15px 0;
              padding-left: 25px;
              position: relative;
            }
            .feature-item:before {
              content: "✓";
              position: absolute;
              left: 0;
              color: #10b981;
              font-weight: bold;
              font-size: 18px;
            }
            .footer {
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px solid #e5e5e5;
              text-align: center;
              color: #999;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="emoji">🎉</div>
              <h1>Welcome, ${displayName}!</h1>
            </div>

            <p class="welcome-text">
              Your email has been verified successfully! You're all set to start using your account.
            </p>

            <p>
              We're excited to have you with us. Your account is now fully activated and ready to use.
            </p>

            <div style="text-align: center;">
              <a href="${frontendUrl}" class="cta-button">
                Get Started
              </a>
            </div>

            <div class="features">
              <h3 style="margin-top: 0; color: #1a1a1a;">What you can do now:</h3>
              <div class="feature-item">Complete your profile</div>
              <div class="feature-item">Explore available features</div>
              <div class="feature-item">Manage your subscription</div>
              <div class="feature-item">Connect with Google for easier access</div>
            </div>

            <p style="color: #666; font-size: 14px; margin-top: 30px;">
              If you have any questions or need help getting started, feel free to reach out to our support team.
            </p>

            <div class="footer">
              <p>This is an automated email. Please do not reply to this message.</p>
              <p>&copy; ${new Date().getFullYear()} All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `,
  })
}
