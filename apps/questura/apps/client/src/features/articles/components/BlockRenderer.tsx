import { PublicImage } from '@/components/media/PublicImage'
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

function TextBlockRenderer({ block }: { block: TextBlock }) {
  return (
    <div
      className="article-prose"
      dangerouslySetInnerHTML={{ __html: block.content }}
    />
  )
}

function ImageBlockRenderer({ block }: { block: ImageBlock }) {
  return (
    <figure className="-mx-4 sm:mx-0 lg:-mx-10">
      <PublicImage
        src={block.image.url}
        alt={block.altText ?? block.image.alt_text ?? ''}
        width={1200}
        height={900}
        sizes="(min-width: 1024px) 880px, (min-width: 768px) 760px, 100vw"
        className="w-full object-cover"
      />
      {block.caption && (
        <figcaption className="px-4 pt-2 text-[11px] text-foreground/50 italic sm:px-0 sm:text-[12px]">
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
    <figure className="-mx-4 sm:mx-0 lg:-mx-10">
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
        <figcaption className="px-4 pt-2 text-[11px] text-foreground/50 italic sm:px-0 sm:text-[12px]">
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
    <figure className="-mx-4 sm:mx-0 lg:-mx-10">
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
        <figcaption className="px-4 pt-2 text-[11px] text-foreground/50 italic sm:px-0 sm:text-[12px]">
          {block.caption}
        </figcaption>
      )}
    </figure>
  )
}

function KeyTakeawayBlockRenderer({ block }: { block: KeyTakeawayBlock }) {
  return (
    <aside className="article-editorial-block my-12 border-y-[3px] border-double border-foreground bg-cream px-5 py-6 sm:px-8 sm:py-7">
      <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.22em] text-terracotta">
        {block.label ?? 'Key Takeaways'}
      </p>
      <ul className="space-y-3">
        {block.items.map((item, index) => (
          <li key={item.id ?? `${index}-${item.text}`} className="flex gap-3">
            <span className="mt-[0.35rem] size-1.5 shrink-0 rounded-full bg-foreground" aria-hidden />
            <span className="font-display text-[17px] leading-[1.55] text-foreground sm:text-[19px]">
              {item.text}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  )
}

function PullQuoteBlockRenderer({ block }: { block: PullQuoteBlock }) {
  return (
    <blockquote className="article-editorial-block my-14 mx-auto max-w-[760px] border-y-[3px] border-double border-foreground px-2 py-8 text-center sm:py-10">
      <p className="font-display text-[32px] font-normal leading-[1.08] text-foreground sm:text-[46px]">
        &ldquo;{block.quote}&rdquo;
      </p>
    </blockquote>
  )
}

function InTheKnowBlockRenderer({ block }: { block: InTheKnowBlock }) {
  return (
    <aside className="article-editorial-block my-12 bg-foreground px-5 py-6 text-background sm:px-8 sm:py-7">
      <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.22em] text-ochre">
        {block.label ?? 'In The Know'}
      </p>
      <p className="font-display text-[19px] leading-[1.55] sm:text-[22px]">
        {block.text}
      </p>
    </aside>
  )
}

function HighlightCalloutBlockRenderer({ block }: { block: HighlightCalloutBlock }) {
  return (
    <aside className="article-editorial-block my-12 border-l-[6px] border-terracotta bg-background-warm px-5 py-6 sm:px-8 sm:py-7">
      <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.22em] text-terracotta">
        {block.label ?? 'Editor Note'}
      </p>
      <p className="font-display text-[21px] font-normal leading-[1.4] text-foreground sm:text-[25px]">
        {block.text}
      </p>
    </aside>
  )
}

function FaqBlockRenderer({ block }: { block: FaqBlock }) {
  return (
    <section className="article-editorial-block my-12 border-y border-foreground px-0 py-5 sm:py-6">
      <h3 className="mb-4 font-mono text-[11px] uppercase tracking-[0.22em] text-terracotta">
        {block.title ?? block.label ?? 'FAQ'}
      </h3>
      <div className="space-y-0">
      {block.items.map((item) => (
        <div key={item.id} className="border-t border-foreground/15 py-4">
          <p className="mb-1 font-display text-[18px] font-semibold leading-snug text-foreground sm:text-[20px]">
            {item.question}
          </p>
          <p className="font-display text-[15px] leading-relaxed text-foreground/75 sm:text-[17px]">
            {item.answer}
          </p>
        </div>
      ))}
      </div>
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
