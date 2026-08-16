/**
 * Shared loading and failure states for gated content.
 *
 * Kept together so a standard article and an itinerary cannot drift into
 * saying different things about the same situation.
 */

export function GatedBodySkeleton() {
  return (
    <div aria-hidden className="space-y-4" data-testid="gated-body-skeleton">
      {[0, 1, 2, 3, 4].map((row) => (
        <div
          key={row}
          className="h-4 animate-pulse rounded bg-foreground/10"
          style={{ width: `${[100, 96, 88, 98, 62][row]}%` }}
        />
      ))}
    </div>
  )
}

export function GatedLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-foreground/12 px-6 py-10 text-center">
      <p className="text-sm text-foreground/70">
        We couldn&rsquo;t load the rest of this. Your membership is fine &mdash; this is a loading
        problem.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-md border border-foreground/20 px-4 py-2 text-sm font-medium transition-colors hover:bg-foreground/5"
      >
        Try again
      </button>
    </div>
  )
}
