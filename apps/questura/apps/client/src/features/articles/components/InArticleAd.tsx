import { AdLabel, AdMockSurface } from './AdMock'
import type { AdVariant } from '../lib/adPlacement'

/**
 * An ad inside the reading column.
 *
 * Not a card. The article is paper held together by rules and whitespace, and
 * the only framed object on the page is the header -- so the ad interrupts the
 * way the editorial blocks do: a hairline above, a labelled gap, the slot, a
 * hairline below. The same grammar as `EditorialLabelRule`, which is what tells
 * the reader where the article stops and starts again.
 *
 * Two shapes, one grammar:
 *   - `banner` is the slot after the opening paragraph. Thin, so it is crossed
 *     rather than met -- a tall unit that early reads as a wall in front of the
 *     article the reader just clicked.
 *   - `rectangle` is the deeper slot, at a section break, where a longer pause
 *     is already expected.
 *
 * The slot is capped well under the measure of the prose so it can never be
 * mistaken for content, and it carries no `--accent` blue: blue is the
 * editorial voice on this site and does not get lent to an advertiser.
 *
 * Vertical air is padding, not margin -- the parent `space-y-*` owns the gap
 * between blocks and `my-*` loses to it.
 */

/**
 * Both slots are exact IAB sizes, so the creative that arrives fits the box the
 * page already reserved and nothing shifts under the reader.
 *   - banner: 320x50 Mobile Leaderboard, 728x90 Leaderboard from `sm` up.
 *   - rectangle: 300x250 Medium Rectangle -- the same slot the rail runs, and
 *     the most widely filled unit there is.
 */
const VARIANTS: Record<AdVariant, { wrap: string; label: string; surface: string; close: string }> = {
  banner: {
    wrap: '',
    label: 'pt-2.5 pb-3',
    surface: 'mx-auto h-[50px] max-w-[320px] sm:h-[90px] sm:max-w-[728px]',
    close: 'mt-5',
  },
  rectangle: {
    wrap: 'py-1 sm:py-2',
    label: 'pt-3 pb-4',
    surface: 'mx-auto h-[250px] max-w-[300px]',
    close: 'mt-7',
  },
}

export function InArticleAd({
  slotId,
  variant = 'rectangle',
}: {
  slotId: string
  variant?: AdVariant
}) {
  const style = VARIANTS[variant]

  return (
    <aside data-in-article-ad={slotId} data-ad-variant={variant} className={style.wrap}>
      <div aria-hidden className="h-px bg-foreground/15" />
      <AdLabel className={style.label} />
      <AdMockSurface className={style.surface} />
      <div aria-hidden className={`${style.close} h-px bg-foreground/15`} />
    </aside>
  )
}
