import { InArticleAd } from './InArticleAd'

/**
 * An ad between two listicle entries.
 *
 * Wrapped in an `<li>` because it lives inside the entries' `<ol>`, and an
 * `<aside>` parked directly in a list is invalid. The list is `list-none` and
 * the entries carry their own numbers from their index, so an extra item cannot
 * shift the numbering.
 */
export function ListicleAd({ slotId }: { slotId: string }) {
  return (
    <li className="list-none py-6 480:py-8">
      <InArticleAd slotId={slotId} variant="rectangle" />
    </li>
  )
}
