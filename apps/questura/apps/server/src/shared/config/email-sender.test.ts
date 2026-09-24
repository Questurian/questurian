import { describe, expect, it } from 'vitest'

import { DEV_DEFAULT_FROM_ADDRESS, emailSenderProblems, resolveEmailSender } from './email-sender'

describe('resolveEmailSender', () => {
  it('uses the configured sender, trimmed', () => {
    expect(
      resolveEmailSender({
        EMAIL_FROM_ADDRESS: ' hello@questurian.com ',
        EMAIL_FROM_NAME: ' Questurian ',
        EMAIL_REPLY_TO: 'help@questurian.com',
      })
    ).toEqual({ fromAddress: 'hello@questurian.com', fromName: 'Questurian', replyTo: 'help@questurian.com' })
  })

  it('falls back to a development default, never the old placeholder', () => {
    const sender = resolveEmailSender({})

    expect(sender.fromAddress).toBe(DEV_DEFAULT_FROM_ADDRESS)
    expect(sender.fromAddress).not.toBe('you@questurian.com')
    expect(sender.replyTo).toBe('')
  })
})

describe('emailSenderProblems', () => {
  const valid = {
    RESEND_API_KEY: 're_x',
    EMAIL_FROM_ADDRESS: 'hello@questurian.com',
    NEXT_PUBLIC_APP_URL: 'https://www.questurian.com',
  }

  it('accepts a sender on the registrable domain of the site', () => {
    expect(emailSenderProblems(valid)).toEqual([])
  })

  it('reports each problem at once', () => {
    expect(emailSenderProblems({ NEXT_PUBLIC_APP_URL: valid.NEXT_PUBLIC_APP_URL })).toHaveLength(2)
  })
})
