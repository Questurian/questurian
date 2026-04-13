type Props = {
  visible: boolean
  /** Shown under the title (e.g. "Updating block order…"). */
  message?: string
}

/**
 * Full-viewport overlay while block reorder saves and homepage data refetches.
 * Parent should set `visible` true in reorder `onMutate` and clear it in `onSuccess`
 * after `await queryClient.invalidateQueries(...)`, or in `onError`.
 */
export default function HomepageBlocksReorderOverlay({ visible, message }: Props) {
  if (!visible) return null

  return (
    <div
      className="hf-blocks-reorder-overlay"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="hf-blocks-reorder-overlay-card">
        <span className="hf-blocks-reorder-spinner" aria-hidden />
        <h2 className="hf-blocks-reorder-overlay-title">Updating block order</h2>
        <p className="hf-blocks-reorder-overlay-text">
          {message ?? 'Saving the new order and refreshing the page.'}
        </p>
      </div>
    </div>
  )
}
