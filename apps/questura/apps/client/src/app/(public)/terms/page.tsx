import type { Metadata } from 'next';
import Link from '@/components/navigation/PublicLink';

import {
  ACCOUNT_DELETION_DAYS,
  ACCOUNT_DELETION_EMAIL,
  ACCOUNT_DELETION_MAILTO,
} from '@/lib/accountDeletion';

export const metadata: Metadata = {
  title: 'Terms',
  description: 'The terms for reading Questurian and paying for a membership.',
};

/**
 * The terms. Like the privacy text, it states what the code does and nothing
 * more; change it when the code changes. No price is quoted here on purpose:
 * the join page and checkout show the price Stripe will charge, and a figure
 * in this static text would drift from it.
 */
export default function TermsPage() {
  const heading = 'font-display text-[1.15rem] 480:text-[1.3rem] text-foreground mt-10 mb-3';
  const body = 'text-[0.95rem] leading-[1.75] text-foreground/80 mb-4';
  const link = 'text-accent underline underline-offset-2';

  return (
    <main className="px-4 480:px-6 pt-10 pb-20 768:pt-14">
      <article className="max-w-2xl mx-auto">
        <h1 className="font-display text-[1.8rem] 480:text-[2.2rem] text-foreground leading-[1.15]">
          Terms
        </h1>
        <p className="text-[0.85rem] text-foreground/60 mt-2">Last updated 25 September 2026</p>

        <p className={`${body} mt-6`}>
          These terms cover reading Questurian and paying for a membership. By using the site or
          buying a membership, you agree to them. If anything here is unclear, email{' '}
          <a href={`mailto:${ACCOUNT_DELETION_EMAIL}`} className={link}>
            {ACCOUNT_DELETION_EMAIL}
          </a>
          .
        </p>

        <h2 className={heading}>Reading</h2>
        <p className={body}>
          Anyone can read our free articles, with no account. Some articles and itineraries are
          for members: anyone can see what they cover, and members can read them in full.
        </p>

        <h2 className={heading}>Your account</h2>
        <p className={body}>
          You can sign up with an email address and a password of at least eight characters, or
          with Google. Keep your sign-in details to yourself; you are responsible for what is done
          with your account. If you think someone else is using it, change your password and sign
          out of every device from your account page.
        </p>

        <h2 className={heading}>Membership and billing</h2>
        <p className={body}>
          A membership opens every members-only article and itinerary. There are two plans,
          monthly and yearly, and they differ only in how you are billed. The price of each is on
          the <Link href="/join" className={link}>join page</Link>, and the checkout page shows it
          again before you pay. Prices are in U.S. dollars. Payment is taken by Stripe. Your
          membership renews automatically at the end of each month or year until you cancel.
        </p>

        <h2 className={heading}>Cancelling</h2>
        <p className={body}>
          You can cancel at any time from your account page. You keep access until the end of the
          period you have paid for, and you are not charged again. Until that date you can undo
          it with Reactivate on the same page.
        </p>

        <h2 className={heading}>Refunds</h2>
        <p className={body}>
          Cancelling stops future payments; it does not refund the period you are in. If you were
          charged by mistake, email us. If a payment is refunded in full, the membership it paid
          for ends straight away.
        </p>

        <h2 className={heading}>Failed payments</h2>
        <p className={body}>
          If a renewal payment fails, Stripe tries your card again and you keep access for a few
          days while it does. If the payment still does not go through, the membership ends.
        </p>

        <h2 className={heading}>Our writing</h2>
        <p className={body}>
          The articles, itineraries and photos on Questurian belong to us and our writers. Read
          them, share links to them and quote short passages with credit, but do not copy or
          republish whole pieces.
        </p>

        <h2 className={heading}>Deleting your account</h2>
        <p className={body}>
          Email{' '}
          <a href={ACCOUNT_DELETION_MAILTO} className={link}>
            {ACCOUNT_DELETION_EMAIL}
          </a>{' '}
          from the address you sign in with, and we delete your account within{' '}
          {ACCOUNT_DELETION_DAYS} days, cancelling any membership first. What we keep and delete is
          on the <Link href="/privacy" className={link}>privacy page</Link>.
        </p>

        <h2 className={heading}>Changes</h2>
        <p className={body}>
          We may change these terms. When we do, the date at the top of this page changes with
          them.
        </p>
      </article>
    </main>
  );
}
