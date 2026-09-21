'use client'

import { useEffect, type ComponentProps } from 'react'
import NextLink, { useLinkStatus } from 'next/link'
import { navigateWithFeedback, reportPendingLink } from './navigationFeedbackStore'

type PublicLinkProps = ComponentProps<typeof NextLink> & {
  /**
   * Set on links whose container unmounts on click (a menu that closes
   * itself). Their own pending state would vanish with them, so the
   * navigation runs in the root-owned transition instead. Only plain
   * client-side navigations are handed over: modified clicks, downloads and
   * external links never reach `onNavigate`.
   */
  keepFeedbackAfterUnmount?: boolean
}

function PendingReporter() {
  const { pending } = useLinkStatus()
  useEffect(() => (pending ? reportPendingLink() : undefined), [pending])
  return null
}

/** `next/link` plus click feedback. Same anchor, props, prefetch and routing. */
export default function PublicLink({
  children,
  keepFeedbackAfterUnmount = false,
  onNavigate,
  ...props
}: PublicLinkProps) {
  const handoff =
    keepFeedbackAfterUnmount && typeof props.href === 'string' && !props.as
      ? props.href
      : null

  return (
    <NextLink
      {...props}
      onNavigate={
        handoff
          ? (event) => {
              onNavigate?.(event)
              if (navigateWithFeedback(handoff, { replace: props.replace, scroll: props.scroll })) {
                event.preventDefault()
              }
            }
          : onNavigate
      }
    >
      <PendingReporter />
      {children}
    </NextLink>
  )
}
