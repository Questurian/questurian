import type { Metadata } from 'next';
import Link from '@/components/navigation/PublicLink';

import {
  ACCOUNT_DELETION_DAYS,
  ACCOUNT_DELETION_EMAIL,
  ACCOUNT_DELETION_MAILTO,
} from '@/lib/accountDeletion';

export const metadata: Metadata = {
  title: 'Membership FAQ',
  description: 'Plain answers about a Questurian membership: plans, payment, cancelling and your account.',
};

/**
 * The membership questions linked from the join page. Every answer states what
 * the code does; change it when the code changes. No price is quoted, for the
 * same reason as the terms: the join page and checkout show the real one.
 */
export default function FaqPage() {
  const heading = 'font-display text-[1.15rem] 480:text-[1.3rem] text-foreground mt-10 mb-3';
  const body = 'text-[0.95rem] leading-[1.75] text-foreground/80 mb-4';
  const link = 'text-accent underline underline-offset-2';
  const contact = (
    <a href={`mailto:${ACCOUNT_DELETION_EMAIL}`} className={link}>
      {ACCOUNT_DELETION_EMAIL}
    </a>
  );

  return (
    <main className="px-4 480:px-6 pt-10 pb-20 768:pt-14">
      <article className="max-w-2xl mx-auto">
        <h1 className="font-display text-[1.8rem] 480:text-[2.2rem] text-foreground leading-[1.15]">
          Membership questions
        </h1>
        <p className="text-[0.85rem] text-foreground/60 mt-2">Last updated 25 September 2026</p>

        <h2 className={`${heading} mt-8`}>What do members get?</h2>
        <p className={body}>
          Every members-only article and itinerary, in full, in every city we cover. The free
          articles stay free for everyone.
        </p>

        <h2 className={heading}>What is the difference between the plans?</h2>
        <p className={body}>
          Only the billing. Monthly is paid each month; yearly is paid once a year and costs less
          over the year. Both open everything. The prices are on the{' '}
          <Link href="/join" className={link}>join page</Link>.
        </p>

        <h2 className={heading}>How do I pay?</h2>
        <p className={body}>
          By card, on a checkout page run by Stripe; Apple Pay works where your device offers it.
          Your card details go to Stripe and never reach us. Prices are in U.S. dollars.
        </p>

        <h2 className={heading}>Do I need an account?</h2>
        <p className={body}>
          Not to read the free articles. To become a member you sign up with an email address and
          a password, or with Google.
        </p>

        <h2 className={heading}>Does it renew by itself?</h2>
        <p className={body}>
          Yes. Your membership renews at the end of each month or year until you cancel. Your
          account page shows the date it renews.
        </p>

        <h2 className={heading}>How do I cancel?</h2>
        <p className={body}>
          From your account page, at any time. You keep access until the end of the period you
          have paid for and are not charged again. Changed your mind? Press Reactivate on the same
          page before that date.
        </p>

        <h2 className={heading}>Can I get a refund?</h2>
        <p className={body}>
          Cancelling does not refund the period you are in. If you were charged by mistake, email{' '}
          {contact}. If a payment is refunded in full, the membership it paid for ends straight
          away.
        </p>

        <h2 className={heading}>Can I switch between monthly and yearly?</h2>
        <p className={body}>
          Not with one button yet. Cancel your current plan, and once the paid period ends, join
          again on the other one. Or email {contact} and we will help.
        </p>

        <h2 className={heading}>What if a payment fails?</h2>
        <p className={body}>
          Stripe tries your card again, and you keep access for a few days while it does. If the
          payment still does not go through, the membership ends and you can join again at any
          time.
        </p>

        <h2 className={heading}>I forgot my password.</h2>
        <p className={body}>
          Choose &ldquo;Forgot password?&rdquo; when you sign in, and we email you a link to set a
          new one. Setting it signs you out on your other devices.
        </p>

        <h2 className={heading}>How do I sign out everywhere?</h2>
        <p className={body}>
          On your account page, choose &ldquo;Sign out everywhere&rdquo;. This browser and every
          other device are signed out within seconds.
        </p>

        <h2 className={heading}>How do I delete my account?</h2>
        <p className={body}>
          Email{' '}
          <a href={ACCOUNT_DELETION_MAILTO} className={link}>
            {ACCOUNT_DELETION_EMAIL}
          </a>{' '}
          from the address you sign in with, and we delete it within {ACCOUNT_DELETION_DAYS} days,
          cancelling any membership first. The{' '}
          <Link href="/privacy" className={link}>privacy page</Link> says what we keep and delete.
        </p>

        <h2 className={heading}>Anything else?</h2>
        <p className={body}>
          Email {contact}. The <Link href="/terms" className={link}>terms</Link> have the rest.
        </p>
      </article>
    </main>
  );
}
