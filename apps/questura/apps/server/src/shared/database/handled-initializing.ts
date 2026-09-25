/**
 * Stop `@payloadcms/db-postgres` from leaking an unhandled rejection every
 * time the database is unreachable.
 *
 * The adapter creates an `initializing` promise when Payload initialises it,
 * and its `connect()` rejects that promise — with no reason — right before it
 * throws "cannot connect to Postgres". Nothing is attached to the promise
 * unless a transaction happens to be waiting on it, so each failed attempt
 * becomes an `unhandledRejection` with `reason: undefined`. Boot retries in
 * the background (`shared/observability/readiness.ts`), and every retry calls
 * `getPayload`, which builds a fresh adapter with a fresh promise: one
 * unexplained rejection per retry, and with SENTRY_DSN set, one Sentry event
 * per retry saying nothing.
 *
 * The failure itself is not lost by handling it here. The adapter logs the
 * real error ("Error: cannot connect to Postgres. Details: ..."), the thrown
 * error reaches `retryUntilReady`, and boot logs one line per attempt. Anyone
 * who awaits `initializing` (a transaction queued behind a reconnect) still
 * gets the rejection on their own await; attaching a handler does not change
 * what they see.
 *
 * `connect()` is wrapped too because the adapter's `destroy()` (HMR reload)
 * replaces `initializing` with a new promise that the next `connect()` can
 * reject the same way.
 */

type InitializingAdapter = {
  initializing?: Promise<unknown>
  connect?: (...args: never[]) => Promise<void>
}

type AdapterResult<TAdapter> = {
  init: (args: never) => TAdapter
}

const noop = () => {}

function handle(adapter: InitializingAdapter): void {
  const pending = adapter.initializing
  if (pending && typeof pending.catch === 'function') pending.catch(noop)
}

export function withHandledInitializing<TResult extends AdapterResult<object>>(result: TResult): TResult {
  const init = result.init
  return {
    ...result,
    init: ((args: never) => {
      const adapter = init(args) as InitializingAdapter
      handle(adapter)

      const connect = adapter.connect
      if (typeof connect === 'function') {
        adapter.connect = async function (this: unknown, ...connectArgs: never[]) {
          handle(adapter)
          return connect.apply(this, connectArgs)
        }
      }

      return adapter
    }) as TResult['init'],
  }
}
