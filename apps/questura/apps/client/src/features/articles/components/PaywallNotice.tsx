import Link from 'next/link'
import { Lock } from 'lucide-react'

import { describeSample, type GateState } from '@/features/articles/lib/gate'

type PaywallNoticeProps = {
  gate: GateState
  /** Path the reader is on, so checkout can return them to it. */
  returnTo: string
}

/**
 * Stands in for the withheld body of a Gated item.
 *
 * Carries `data-paywalled`, which is what the page's paywall JSON-LD points at
 * with `cssSelector`. Renaming or removing that attribute silently breaks the
 * structured data, so the two live and change together (ADR-0009).
 *
 * Server-rendered inside the cached public shell, so it must not depend on who
 * is reading. A member sees this too, until the client swaps the full body in.
 */
export function PaywallNotice({ gate, returnTo }: PaywallNoticeProps) {
  const summary = describeSample(gate)
  const href = `/join?returnTo=${encodeURIComponent(returnTo)}`

  return (
    <aside
      data-paywalled
      aria-label="Members-only content"
      className="rounded-lg border border-foreground/12 bg-foreground/[0.03] px-6 py-10 text-center sm:px-10"
    >
      <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-foreground/50">
        <Lock aria-hidden="true" className="h-3.5 w-3.5" />
        Members only
      </span>

      <p className="mx-auto mt-4 max-w-[34ch] text-balance text-xl font-medium leading-snug">
        {summary ? `You're reading ${summary}.` : 'The rest of this is for members.'}
      </p>

      <p className="mx-auto mt-3 max-w-[46ch] text-sm leading-relaxed text-foreground/60">
        Join to unlock the rest of this and everything else on Questurian.
      </p>

      <Link
        href={href}
        className="mt-7 inline-flex items-center justify-center rounded-md bg-foreground px-6 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90"
      >
        Unlock the full guide
      </Link>

      <p className="mt-4 font-mono text-[11px] text-foreground/45">
        Already a member?{' '}
        <Link href={href} className="underline underline-offset-2 hover:text-foreground/70">
          Sign in
        </Link>
      </p>
    </aside>
  )
}
