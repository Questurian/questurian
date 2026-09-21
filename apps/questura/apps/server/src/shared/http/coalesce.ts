/**
 * One answer for identical work already in flight.
 *
 * Four simultaneous requests for the same city page each assembled the page
 * from scratch: four times 43 document reads and 382 statements for one
 * answer. That is the shape of a cold cache after a publish, or a crawler
 * opening several connections, or one popular page at the moment its
 * revalidation expires — the times the server is least able to afford it.
 *
 * Per process and in flight only. Nothing is retained after the work settles,
 * so this is not a cache and cannot serve a stale answer: the second caller
 * gets exactly what the first one computed at the moment they overlapped.
 *
 * A rejection is shared with everyone waiting, which is the same outcome they
 * would each have reached on their own, and the entry is dropped either way so
 * the next caller starts fresh.
 */

const inFlight = new Map<string, Promise<unknown>>()

export type CoalescedResult<T> = {
  value: T
  /** True when this caller joined work someone else had already started. */
  joined: boolean
}

export async function coalesce<T>(
  key: string,
  work: () => Promise<T>,
): Promise<CoalescedResult<T>> {
  const existing = inFlight.get(key) as Promise<T> | undefined
  if (existing) return { value: await existing, joined: true }

  const pending = work()
  inFlight.set(key, pending)

  try {
    return { value: await pending, joined: false }
  } finally {
    inFlight.delete(key)
  }
}

/** Test seam: drop anything still registered between cases. */
export function resetCoalescedWork(): void {
  inFlight.clear()
}

/** How many distinct pieces of work are in flight. For diagnostics and tests. */
export function inFlightCount(): number {
  return inFlight.size
}
