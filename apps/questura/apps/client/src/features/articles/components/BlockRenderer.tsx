import { PublicImage } from '@/components/media/PublicImage'
import {
  EditorialLabelRule,
  EditorialRule,
  EditorialTick,
  editorialKickerClass,
} from './EditorialRule'
import { InlineMarkdown } from './InlineMarkdown'
import {
  ContentBlock,
  FaqBlock,
  HighlightCalloutBlock,
  ImageBlock,
  ImgPairBlock,
  ImgTrioBlock,
  InTheKnowBlock,
  KeyTakeawayBlock,
  PullQuoteBlock,
  TextBlock,
} from '../types'

/**
 * Renderers for a standard article's content blocks.
 *
 * Extracted from ArticlePage so the same switch can render blocks that arrive
 * after hydration -- a member's full body comes from a client fetch, not from
 * the cached server render (ADR-0009).
 */

/**
 * One run of body HTML.
 *
 * A text block is split into several of these when an ad is planned inside it
 * (see `lib/adPlacement`). Each run keeps the `article-prose` class so the
 * descendant type rules still apply, and drops the leading heading's top margin
 * -- the parent `space-y-*` already owns the gap after the ad above it.
 */
export function ProseRun({ html }: { html: string }) {
  return (
    <div
      className="article-prose [&>h2:first-child]:mt-0 [&>h3:first-child]:mt-0"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function TextBlockRenderer({ block }: { block: TextBlock }) {
  return <ProseRun html={block.content} />
}

function ImageBlockRenderer({ block }: { block: ImageBlock }) {
  return (
    <figure className="-mx-4 1024:mx-0">
      <PublicImage
        src={block.image.url}
        alt={block.altText ?? block.image.alt_text ?? ''}
        width={1200}
        height={900}
        sizes="(min-width: 1024px) 880px, (min-width: 768px) 760px, 100vw"
        className="w-full object-cover"
      />
      {block.caption && (
        <figcaption className="px-4 pt-2 text-[11px] italic text-foreground/50 1024:px-0 sm:text-[12px]">
          {block.caption}
        </figcaption>
      )}
    </figure>
  )
}

function ImgPairBlockRenderer({ block }: { block: ImgPairBlock }) {
  const alt1 = block.imageOne.mediaSet?.alt_text ?? block.imageOne.alt_text ?? ''
  const alt2 = block.imageTwo.mediaSet?.alt_text ?? block.imageTwo.alt_text ?? ''

  return (
    <figure className="-mx-4 1024:mx-0">
      <div className="flex gap-1 sm:gap-2">
        <PublicImage
          src={block.imageOne.url}
          alt={alt1}
          width={720}
          height={960}
          sizes="(min-width: 1024px) 436px, (min-width: 768px) 376px, 50vw"
          className="w-1/2 aspect-[3/4] object-cover"
        />
        <PublicImage
          src={block.imageTwo.url}
          alt={alt2}
          width={720}
          height={960}
          sizes="(min-width: 1024px) 436px, (min-width: 768px) 376px, 50vw"
          className="w-1/2 aspect-[3/4] object-cover"
        />
      </div>
      {block.caption && (
        <figcaption className="px-4 pt-2 text-[11px] italic text-foreground/50 1024:px-0 sm:text-[12px]">
          {block.caption}
        </figcaption>
      )}
    </figure>
  )
}

function ImgTrioBlockRenderer({ block }: { block: ImgTrioBlock }) {
  const images = [block.imageOne, block.imageTwo, block.imageThree]
  const isLandscape = block.format === 'landscape'
  const imageClassName = isLandscape ? 'aspect-[16/10]' : 'aspect-square'

  return (
    <figure className="-mx-4 1024:mx-0">
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-3 sm:gap-2">
        {images.map((image, index) => (
          <PublicImage
            key={`${image.id}-${index}`}
            src={image.url}
            alt={image.mediaSet?.alt_text ?? image.alt_text ?? ''}
            width={720}
            height={isLandscape ? 450 : 720}
            sizes="(min-width: 1024px) 288px, (min-width: 640px) 33vw, 100vw"
            className={`w-full object-cover ${imageClassName}`}
          />
        ))}
      </div>
      {block.caption && (
        <figcaption className="px-4 pt-2 text-[11px] italic text-foreground/50 1024:px-0 sm:text-[12px]">
          {block.caption}
        </figcaption>
      )}
    </figure>
  )
}

/**
 * Editorial blocks.
 *
 * Not cards. The column is paper held by type, hairlines and whitespace; the
 * only framed object on an article is the header. Each block interrupts the
 * reading column as type:
 *   - a sans kicker with a trailing hairline (`EditorialLabelRule`),
 *   - accent blue for labels and ticks (see `--accent` in foundations.css),
 *   - Playfair at reading size, left-aligned on the same grid as the prose.
 *
 * Pull quote is the one ornamental beat (double-rule diamond). "In The Know"
 * is the one change of ground: a `--paper-accent` wash, no border.
 *
 * Vertical air uses padding, not margin -- the parent `space-y-*` already
 * owns the gap between blocks, and `my-*` loses the fight with it.
 */

function KeyTakeawayBlockRenderer({ block }: { block: KeyTakeawayBlock }) {
  return (
    <aside className="py-4 sm:py-5">
      <EditorialLabelRule className="mb-5">
        {block.label ?? 'Key Takeaways'}
      </EditorialLabelRule>
      <ul className="flex flex-col gap-3.5 sm:gap-4">
        {block.items.map((item, index) => (
          <li key={item.id ?? `${index}-${item.text}`} className="flex gap-3 text-foreground">
            <EditorialTick className="text-accent" />
            <span className="font-display text-[15px] leading-[1.72] sm:text-[18px] sm:leading-[1.78]">
              <InlineMarkdown text={item.text} />
            </span>
          </li>
        ))}
      </ul>
      <div aria-hidden className="mt-6 h-px bg-foreground/15" />
    </aside>
  )
}

function PullQuoteBlockRenderer({ block }: { block: PullQuoteBlock }) {
  return (
    <blockquote className="py-8 text-foreground sm:py-12">
      <EditorialRule className="mx-auto max-w-[18ch] text-foreground/50" />
      <p className="my-8 text-center font-display text-[26px] font-normal italic leading-[1.22] sm:my-10 sm:text-[34px] sm:leading-[1.18]">
        &ldquo;<InlineMarkdown text={block.quote} />&rdquo;
      </p>
      <EditorialRule className="mx-auto max-w-[18ch] text-foreground/50" />
    </blockquote>
  )
}

function InTheKnowBlockRenderer({ block }: { block: InTheKnowBlock }) {
  return (
    // The one tinted surface. A wash rather than a card: no border, and it
    // bleeds past the column edge on narrow screens so it reads as a change of
    // ground. Type stays on the same inset as the prose.
    <aside className="-mx-4 bg-paper-accent px-4 py-8 sm:mx-0 sm:px-0 sm:py-9">
      <EditorialLabelRule className="mb-4">
        {block.label ?? 'In The Know'}
      </EditorialLabelRule>
      <p className="font-display text-[15px] leading-[1.72] text-foreground sm:text-[18px] sm:leading-[1.78]">
        <InlineMarkdown text={block.text} />
      </p>
    </aside>
  )
}

function HighlightCalloutBlockRenderer({ block }: { block: HighlightCalloutBlock }) {
  return (
    // A marginal note: one accent hairline in the gutter, no fill, no frame.
    <aside className="border-l-2 border-accent py-1 pl-4 sm:pl-5">
      <p className={`mb-2.5 text-accent ${editorialKickerClass}`}>
        {block.label ?? 'Editor Note'}
      </p>
      <p className="font-display text-[16px] font-normal italic leading-[1.55] text-foreground sm:text-[19px] sm:leading-[1.5]">
        <InlineMarkdown text={block.text} />
      </p>
    </aside>
  )
}

function FaqBlockRenderer({ block }: { block: FaqBlock }) {
  return (
    <section className="py-4 sm:py-5">
      <EditorialLabelRule className="mb-1">
        {block.title ?? block.label ?? 'FAQ'}
      </EditorialLabelRule>
      <dl>
        {block.items.map((item, index) => (
          <div
            key={item.id}
            className={index === 0 ? 'py-5' : 'border-t border-foreground/12 py-5'}
          >
            <dt className="font-display text-[16px] font-semibold leading-[1.35] text-foreground sm:text-[18px]">
              <InlineMarkdown text={item.question} />
            </dt>
            <dd className="mt-1.5 font-display text-[15px] leading-[1.72] text-foreground/70 sm:text-[17px] sm:leading-[1.7]">
              <InlineMarkdown text={item.answer} />
            </dd>
          </div>
        ))}
      </dl>
      <div aria-hidden className="h-px bg-foreground/15" />
    </section>
  )
}

export function BlockRenderer({ block }: { block: ContentBlock }) {
  switch (block.blockType) {
    case 'text':
      return <TextBlockRenderer block={block} />
    case 'image':
      return <ImageBlockRenderer block={block} />
    case 'img-pair':
      return <ImgPairBlockRenderer block={block} />
    case 'img-trio':
      return <ImgTrioBlockRenderer block={block} />
    case 'key-takeaway':
      return <KeyTakeawayBlockRenderer block={block} />
    case 'pull-quote':
      return <PullQuoteBlockRenderer block={block} />
    case 'in-the-know':
      return <InTheKnowBlockRenderer block={block} />
    case 'highlight-callout':
      return <HighlightCalloutBlockRenderer block={block} />
    case 'faq':
      return <FaqBlockRenderer block={block} />
    default:
      return null
  }
}
