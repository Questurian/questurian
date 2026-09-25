import { SANDBOX, expect, test } from './fixtures'
import { buyMembership, fakeStripe } from './sandbox'

/**
 * Journey 8 (launch fix plan item 8): the account page tells a member what
 * they pay for, when it renews, and lets them cancel and change their mind.
 *
 * Each test buys a membership as a new reader through the fake Stripe on
 * :3191 (journey 2's road), so it runs in the sandbox only. Cancelling and
 * reactivating go through the app to the fake, which is what Stripe would
 * answer; nothing renews or charges.
 */

test.skip(!SANDBOX, 'buys a membership: sandbox only')

/** How the account page writes an access date: long month, in UTC (`client/src/lib/dates.ts`). */
const accessDate = (seconds: number) =>
  new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(seconds * 1000))

for (const { plan, period } of [
  { plan: 'monthly', period: 'Monthly' },
  { plan: 'yearly', period: 'Yearly' },
] as const) {
  test(`journey 8: a ${plan} member's account page shows the plan, the renewal date and "${period}"`, async ({ page }) => {
    const { subscription } = await buyMembership(page, plan)
    const renews = accessDate(subscription.current_period_end)

    await page.goto('/account')
    const card = page.locator('div').filter({ has: page.getByRole('heading', { name: 'Membership', exact: true }) }).last()
    await expect(card.getByText('Premium Member', { exact: true })).toBeVisible()
    await expect(card.getByText(`Your premium membership renews on ${renews}.`)).toBeVisible()
    const billing = card.getByText('Billing Information').locator('..')
    await expect(billing).toContainText(`Billing Period:${period}`)
    await expect(billing).toContainText(`Next Payment:${renews}`)
    await expect(billing).not.toContainText(period === 'Monthly' ? 'Yearly' : 'Monthly')
  })
}

test('journey 8: a member cancels, keeps access to the end of the period, then reactivates', async ({ page }) => {
  const { subscription } = await buyMembership(page, 'monthly')
  const ends = accessDate(subscription.current_period_end)

  await page.goto('/account')
  await page.getByRole('button', { name: 'Cancel Subscription' }).click()
  await page.getByRole('button', { name: 'Yes, Cancel Subscription' }).click()

  await expect(page.getByText('Premium - Expiring', { exact: true })).toBeVisible()
  await expect(page.getByText(`Your premium membership will expire on ${ends}.`, { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel Subscription' })).toHaveCount(0)
  expect((await fakeStripe('/__fake/state')).subscriptions).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: subscription.id, cancel_at_period_end: true, status: 'active' })]),
  )

  // What the page says survives a reload: it is the server's answer.
  await page.reload()
  await expect(page.getByText('Premium - Expiring', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Reactivate' }).click()
  await expect(page.getByText('Premium Member', { exact: true })).toBeVisible()
  await expect(page.getByText(`Your premium membership renews on ${ends}.`)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reactivate' })).toHaveCount(0)
  expect((await fakeStripe('/__fake/state')).subscriptions).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: subscription.id, cancel_at_period_end: false, status: 'active' })]),
  )

  await page.reload()
  await expect(page.getByText('Premium Member', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel Subscription' })).toBeVisible()
})
