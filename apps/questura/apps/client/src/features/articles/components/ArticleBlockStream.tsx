import { Fragment } from 'react'
import { BlockRenderer, ProseRun } from './BlockRenderer'
import { InArticleAd } from './InArticleAd'
import type { AdPlan } from '../lib/adPlacement'
import type { ContentBlock } from '../types'

type ArticleBlockStreamProps = {
  blocks: ContentBlock[]
  plan: AdPlan
  /** Index of `blocks[0]` within the article's full block list. */
  startIndex?: number
}

/**
 * Renders a run of blocks with the planned ads spliced in.
 *
 * Both sides of the paywall go through this: the server renders the sample and
 * `GatedArticleBody` renders the remainder after hydration (ADR-0009). The plan
 * is indexed against the *full* block list, so the gated half passes its offset
 * as `startIndex` and the two halves cannot double-place or drop a slot.
 *
 * Fragments, not wrappers -- the parent's `space-y-*` only reaches direct DOM
 * children, and an extra div would swallow the gaps.
 */
export function ArticleBlockStream({
  blocks,
  plan,
  startIndex = 0,
}: ArticleBlockStreamProps) {
  return (
    <>
      {blocks.map((block, offset) => {
        const index = startIndex + offset
        const runs = plan.proseRuns.get(index)
        const runAds = plan.proseAds.get(index) ?? []
        const afterBlock = plan.afterBlock.get(index)

        return (
          <Fragment key={block.id}>
            {runs && block.blockType === 'text' ? (
              runs.map((html, runIndex) => (
                <Fragment key={runIndex}>
                  <ProseRun html={html} />
                  {runIndex < runs.length - 1 ? (
                    <InArticleAd
                      slotId={`body-${index}-${runIndex}`}
                      variant={runAds[runIndex]}
                    />
                  ) : null}
                </Fragment>
              ))
            ) : (
              <BlockRenderer block={block} />
            )}
            {afterBlock ? (
              <InArticleAd slotId={`body-${index}`} variant={afterBlock} />
            ) : null}
          </Fragment>
        )
      })}
    </>
  )
}
