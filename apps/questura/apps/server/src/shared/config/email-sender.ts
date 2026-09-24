import { registrableDomain } from './session-cookie'

/**
 * Who Questura's email comes from.
 *
 * Every message (visitor password resets and verification links, membership
 * notices, security notices, and Payload's own staff password-set email) goes
 * out through the one Resend adapter in `payload.config.ts`, which stamps this
 * sender on it.
 *
 * The address has to be on the site's own domain. Resend only sends from a
 * domain verified in the account, and SPF, DKIM and DMARC only line up when
 * the `From` domain is the one those DNS records are published for
 * (`docs/procedures/email-domain.md`). A sender on any other domain either
 * fails to send or lands in spam, and the first person to notice is a reader
 * whose password reset never arrives.
 *
 * Development keeps a default so `pnpm dev` works without extra setup;
 * production must state the sender (`assert-production-config.ts`).
 */

export const DEV_DEFAULT_FROM_ADDRESS = 'noreply@questurian.com'
export const DEFAULT_FROM_NAME = 'Questurian'

export type EmailSenderEnv = {
  EMAIL_FROM_ADDRESS?: string
  EMAIL_FROM_NAME?: string
  EMAIL_REPLY_TO?: string
  RESEND_API_KEY?: string
  NEXT_PUBLIC_APP_URL?: string
}

export type EmailSender = {
  fromAddress: string
  fromName: string
  /** Empty when replies should go to the from address. */
  replyTo: string
}

export function resolveEmailSender(env: EmailSenderEnv): EmailSender {
  return {
    fromAddress: env.EMAIL_FROM_ADDRESS?.trim() || DEV_DEFAULT_FROM_ADDRESS,
    fromName: env.EMAIL_FROM_NAME?.trim() || DEFAULT_FROM_NAME,
    replyTo: env.EMAIL_REPLY_TO?.trim() || '',
  }
}

/**
 * One `local@domain`, no display name, no spaces, no list. Deliberately
 * stricter than RFC 5322: this is a value an operator types into a dashboard.
 */
const SINGLE_ADDRESS = /^[^\s@<>,;"]+@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i

function domainOf(address: string): string | null {
  const match = SINGLE_ADDRESS.exec(address)
  return match ? match[1]!.toLowerCase() : null
}

/** Whether `domain` is `site` itself or one of its subdomains (`send.questurian.com`). */
function isOnSiteDomain(domain: string, site: string): boolean {
  return domain === site || domain.endsWith(`.${site}`)
}

/**
 * What stops production from sending mail that arrives. Names the variable and
 * never the key's value.
 */
export function emailSenderProblems(env: EmailSenderEnv): string[] {
  const problems: string[] = []

  if (!env.RESEND_API_KEY?.trim()) {
    problems.push(
      'RESEND_API_KEY is not set — password resets, verification links and membership ' +
        'emails would all fail, and the first sign would be a reader who cannot sign in.'
    )
  }

  const fromAddress = env.EMAIL_FROM_ADDRESS?.trim() ?? ''
  let siteDomain: string | null = null
  try {
    siteDomain = registrableDomain(new URL(env.NEXT_PUBLIC_APP_URL ?? '').hostname)
  } catch {
    // NEXT_PUBLIC_APP_URL is reported by the required-URL check.
  }

  if (!fromAddress) {
    problems.push(
      'EMAIL_FROM_ADDRESS is not set — name the sender on the site\'s domain ' +
        `(e.g. hello@${siteDomain ?? 'questurian.com'}); see docs/procedures/email-domain.md.`
    )
  } else {
    const domain = domainOf(fromAddress)
    if (!domain) {
      problems.push(`EMAIL_FROM_ADDRESS is not a single email address (${fromAddress}).`)
    } else if (siteDomain && !isOnSiteDomain(domain, siteDomain)) {
      problems.push(
        `EMAIL_FROM_ADDRESS is on ${domain}, not the site's domain ${siteDomain} — Resend ` +
          'only sends from the verified domain, and SPF, DKIM and DMARC would not line up.'
      )
    }
  }

  const replyTo = env.EMAIL_REPLY_TO?.trim() ?? ''
  if (replyTo && !domainOf(replyTo)) {
    problems.push(`EMAIL_REPLY_TO is not a single email address (${replyTo}).`)
  }

  const fromName = env.EMAIL_FROM_NAME?.trim() ?? ''
  if (/[<>"\r\n]/.test(fromName)) {
    problems.push('EMAIL_FROM_NAME contains <, >, a quote or a line break, which would break the From header.')
  }

  return problems
}
