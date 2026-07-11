import { Bookmark, Share2 } from 'lucide-react'
import { PublicImage } from '@/components/media/PublicImage'
import { AuthorLink } from '@/features/authors/components/AuthorLink'
import {
  Article,
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
} from './types'

function formatArticleDate(iso: string | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone: 'America/New_York',
  })
    .format(date)
    .replace(' at ', ', ')
}

function formatLocationLabel(location: string | undefined): string {
  const parts = (location ?? '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length === 0) return 'Questurian'

  return parts
    .map((part) =>
      part
        .split('-')
        .map((word) => (word ? `${word[0].toUpperCase()}${word.slice(1)}` : word))
        .join(' '),
    )
    .join(' / ')
}

function StandardArticleHeader({ article }: { article: Article }) {
  const { title, author, publishedAt, updatedAt, seoSection, location } = article
  const description = seoSection?.metaDescription
  const label = formatLocationLabel(location)
  const displayName = author?.publicProfile?.displayName
  const dateLine = formatArticleDate(publishedAt ?? updatedAt)

  return (
    <header className="mx-auto w-full max-w-[840px] px-4 pt-8 pb-8 sm:px-0 sm:pt-12 sm:pb-10 lg:pt-16">
      <p className="mb-7 font-mono text-[12px] uppercase tracking-[0.18em] text-foreground">
        {label}
      </p>
      <h1 className="font-display text-[36px] font-normal leading-[1.05] text-foreground sm:text-[46px] lg:text-[52px]">
        {title}
      </h1>
      {description ? (
        <p className="mt-6 max-w-[680px] font-display text-[20px] leading-[1.32] text-foreground sm:text-[22px] lg:text-[23px]">
          {description}
        </p>
      ) : null}
      {displayName ? (
        <p className="mt-7 font-display text-[20px] leading-snug text-foreground sm:text-[22px]">
          By <AuthorLink authorSlug={author?.slug} authorId={author?.id} className="hover:underline">{displayName}</AuthorLink>
        </p>
      ) : null}
      {dateLine ? (
        <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-foreground/55 sm:hidden">
          {dateLine}
        </p>
      ) : null}
    </header>
  )
}

function ArticleMetaRow({
  publishedAt,
  updatedAt,
}: {
  publishedAt?: string
  updatedAt?: string
}) {
  const dateLine = formatArticleDate(publishedAt ?? updatedAt)

  return (
    <div className="mx-auto max-w-[700px] border-b border-t border-foreground/18 px-4 py-5 sm:px-0">
      <div className="flex items-center justify-between gap-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-foreground">
          {dateLine}
        </p>
        <div className="flex shrink-0 items-center gap-6 font-mono text-[11px] uppercase tracking-[0.14em] text-foreground">
          <button type="button" className="inline-flex items-center gap-1.5 hover:text-terracotta">
            Share <Share2 size={16} strokeWidth={1.6} aria-hidden />
          </button>
          <button type="button" className="inline-flex items-center gap-1.5 hover:text-terracotta">
            Save <Bookmark size={16} strokeWidth={1.6} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  )
}

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

function BlockRenderer({ block }: { block: ContentBlock }) {
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

// ── Main component ───────────────────────────────────────────────────────────

export function ArticlePage({ article }: { article: Article }) {
  const { publishedAt, updatedAt, headerSection, contentBlocks } = article
  const featuredImage = headerSection?.featuredImage

  return (
    <article
      data-article-layout="standard"
      className="min-h-screen bg-background"
    >
      <div className="mx-auto w-full max-w-[960px]">

        <StandardArticleHeader article={article} />

        {/* ── Featured image ───────────────────────────────────────── */}
        {featuredImage?.url && (
          <figure className="px-0">
            <div className="aspect-[16/10] w-full overflow-hidden">
              <PublicImage
                src={featuredImage.url}
                alt={featuredImage.alt_text ?? ''}
                width={1600}
                height={1000}
                sizes="(min-width: 1024px) 880px, (min-width: 768px) 760px, 100vw"
                className="w-full h-full object-cover"
                priority
              />
            </div>
            {featuredImage.alt_text ? (
              <figcaption className="pt-2 font-mono text-[11px] text-foreground/45">
                {featuredImage.alt_text}
              </figcaption>
            ) : null}
          </figure>
        )}

        <ArticleMetaRow publishedAt={publishedAt} updatedAt={updatedAt} />

        {/* ── Content blocks ───────────────────────────────────────── */}
        <div className="px-4 pt-10 pb-20 sm:px-0 sm:pt-12">
          <div className="mx-auto max-w-[700px] space-y-8 sm:space-y-10">
            {contentBlocks?.map((block) => (
              <BlockRenderer key={block.id} block={block} />
            ))}
          </div>
        </div>

      </div>
    </article>
  )
}
