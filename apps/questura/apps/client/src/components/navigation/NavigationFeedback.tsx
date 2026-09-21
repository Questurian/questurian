'use client'

import { useEffect, useSyncExternalStore, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import messages from '../../../messages/en.json'
import {
  isNavigationPending,
  registerNavigator,
  setTransitionPending,
  subscribeNavigationFeedback,
} from './navigationFeedbackStore'

/**
 * The one owner of navigation feedback. Mounted in the root layout so it
 * outlives every page, menu and link. Renders a thin static line (shown by CSS
 * only if the wait passes 150 ms) and a polite status for assistive tech.
 */
export function NavigationFeedback() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const active = useSyncExternalStore(subscribeNavigationFeedback, isNavigationPending, () => false)

  useEffect(
    () =>
      registerNavigator((href, options) => {
        startTransition(() => {
          if (options?.replace) router.replace(href, { scroll: options.scroll })
          else router.push(href, { scroll: options?.scroll })
        })
      }),
    [router],
  )

  useEffect(() => {
    setTransitionPending(isPending)
  }, [isPending])

  useEffect(() => () => setTransitionPending(false), [])

  return (
    <>
      <div data-nav-feedback aria-hidden className="nav-feedback" />
      <p role="status" className="sr-only">
        {active ? messages.navigation.loading : ''}
      </p>
    </>
  )
}
