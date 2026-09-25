'use client';

import { useEffect, useState, type ComponentProps } from 'react';

import Link from '@/components/navigation/PublicLink';

/**
 * A plan link on `/join` that keeps the paywall's `?returnTo=` (launch fix
 * plan item 8, browser journey 2).
 *
 * The paywall sends a reader to `/join?returnTo=<the article>`, and the
 * success page forwards a buyer to `returnTo` once membership is live, but the
 * plan links dropped it, so every buyer landed on `/account` instead of the
 * article they paid to read. `/join` is a cached page, so the parameter is
 * read in the browser after hydration rather than on the server; the server
 * validates it again before it reaches Stripe's `success_url`.
 */
export default function PlanLink({ href, ...props }: ComponentProps<typeof Link> & { href: string }) {
  const [target, setTarget] = useState(href);

  useEffect(() => {
    const returnTo = new URLSearchParams(window.location.search).get('returnTo');
    setTarget(returnTo ? `${href}?returnTo=${encodeURIComponent(returnTo)}` : href);
  }, [href]);

  return <Link href={target} {...props} />;
}
